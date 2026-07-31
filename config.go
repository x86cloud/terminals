package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	appDirName = "WailsTerminal"
	encPrefix  = "enc:v1:"
)

// ServerConfig 描述一台远程 Linux 服务器的连接信息。
type ServerConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"authType"` // password | key
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"` // 私钥文件路径或 PEM 内容
	Passphrase string `json:"passphrase"`
	Remark     string `json:"remark"`
	UpdatedAt  int64  `json:"updatedAt"`
}

func (c ServerConfig) label() string {
	if strings.TrimSpace(c.Name) != "" {
		return c.Name
	}
	return fmt.Sprintf("%s@%s", c.Username, c.Host)
}

func (c ServerConfig) addr() string {
	port := c.Port
	if port <= 0 {
		port = 22
	}
	return fmt.Sprintf("%s:%d", c.Host, port)
}

func (c ServerConfig) validate() error {
	if strings.TrimSpace(c.Host) == "" {
		return errors.New("主机地址不能为空")
	}
	if strings.TrimSpace(c.Username) == "" {
		return errors.New("用户名不能为空")
	}
	if c.AuthType == authTypeKey && strings.TrimSpace(c.PrivateKey) == "" {
		return errors.New("请选择私钥文件或填写私钥内容")
	}
	return nil
}

const (
	authTypePassword = "password"
	authTypeKey      = "key"
)

// secretBox 使用 AES-GCM 加密本地保存的敏感字段。
type secretBox struct {
	gcm cipher.AEAD
}

func newSecretBox(key []byte) (*secretBox, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &secretBox{gcm: gcm}, nil
}

func (s *secretBox) encrypt(plain string) string {
	if plain == "" {
		return ""
	}
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plain
	}
	sealed := s.gcm.Seal(nonce, nonce, []byte(plain), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(sealed)
}

func (s *secretBox) decrypt(value string) string {
	if !strings.HasPrefix(value, encPrefix) {
		return value
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil || len(raw) <= s.gcm.NonceSize() {
		return ""
	}
	nonce, cipherText := raw[:s.gcm.NonceSize()], raw[s.gcm.NonceSize():]
	plain, err := s.gcm.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return ""
	}
	return string(plain)
}

// Store 负责服务器列表的持久化。
type Store struct {
	mu      sync.RWMutex
	dir     string
	file    string
	box     *secretBox
	servers []ServerConfig
}

func appConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			return "", err
		}
		base = filepath.Join(home, ".config")
	}
	dir := filepath.Join(base, appDirName)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func loadOrCreateKey(dir string) ([]byte, error) {
	keyPath := filepath.Join(dir, "secret.key")
	if data, err := os.ReadFile(keyPath); err == nil && len(data) == 32 {
		return data, nil
	}
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyPath, key, 0o600); err != nil {
		return nil, err
	}
	return key, nil
}

func NewStore() (*Store, error) {
	dir, err := appConfigDir()
	if err != nil {
		return nil, err
	}
	key, err := loadOrCreateKey(dir)
	if err != nil {
		return nil, err
	}
	box, err := newSecretBox(key)
	if err != nil {
		return nil, err
	}
	s := &Store{
		dir:  dir,
		file: filepath.Join(dir, "servers.json"),
		box:  box,
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.file)
	if err != nil {
		if os.IsNotExist(err) {
			s.servers = []ServerConfig{}
			return nil
		}
		return err
	}
	var list []ServerConfig
	if err := json.Unmarshal(data, &list); err != nil {
		// 配置损坏时不阻塞启动
		s.servers = []ServerConfig{}
		return nil
	}
	for i := range list {
		list[i].Password = s.box.decrypt(list[i].Password)
		list[i].Passphrase = s.box.decrypt(list[i].Passphrase)
		list[i].PrivateKey = s.box.decrypt(list[i].PrivateKey)
	}
	s.servers = list
	return nil
}

// persist 需在持有写锁的情况下调用。
func (s *Store) persist() error {
	out := make([]ServerConfig, len(s.servers))
	copy(out, s.servers)
	for i := range out {
		out[i].Password = s.box.encrypt(out[i].Password)
		out[i].Passphrase = s.box.encrypt(out[i].Passphrase)
		out[i].PrivateKey = s.box.encrypt(out[i].PrivateKey)
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.file)
}

func (s *Store) List() []ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ServerConfig, len(s.servers))
	copy(out, s.servers)
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(out[i].label()) < strings.ToLower(out[j].label())
	})
	return out
}

func (s *Store) Get(id string) (ServerConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.servers {
		if item.ID == id {
			return item, true
		}
	}
	return ServerConfig{}, false
}

func (s *Store) Save(cfg ServerConfig) (ServerConfig, error) {
	if err := cfg.validate(); err != nil {
		return ServerConfig{}, err
	}
	if cfg.Port <= 0 {
		cfg.Port = 22
	}
	if cfg.AuthType != authTypeKey {
		cfg.AuthType = authTypePassword
	}
	cfg.UpdatedAt = time.Now().Unix()

	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg.ID == "" {
		cfg.ID = uuid.NewString()
		s.servers = append(s.servers, cfg)
	} else {
		found := false
		for i := range s.servers {
			if s.servers[i].ID == cfg.ID {
				s.servers[i] = cfg
				found = true
				break
			}
		}
		if !found {
			s.servers = append(s.servers, cfg)
		}
	}
	if err := s.persist(); err != nil {
		return ServerConfig{}, err
	}
	return cfg, nil
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.servers[:0]
	for _, item := range s.servers {
		if item.ID != id {
			next = append(next, item)
		}
	}
	s.servers = next
	return s.persist()
}
