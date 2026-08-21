package services

import (
	"terminal/proto"
)

type ApiService struct{}

func NewApiService() *ApiService {
	return &ApiService{}
}

func (s *ApiService) ApiRequest(req proto.ApiRequest) (proto.ApiResponse, error) {
	return proto.HttpApiRequest(req)
}

func (s *ApiService) WsConnect(req proto.WsConnectRequest) (proto.WsConnectResult, error) {
	return GetContainer().WsMgr.WsConnect(req)
}

func (s *ApiService) WsSend(id string, message string) error {
	return GetContainer().WsMgr.WsSend(id, message)
}

func (s *ApiService) WsClose(id string) {
	GetContainer().WsMgr.WsClose(id)
}
