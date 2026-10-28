use serde_json::{Map, Value};

pub fn as_string(val: Option<&Value>) -> String {
    match val {
        Some(Value::Null) | None => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => other.to_string(),
    }
}

pub fn csv_escape_field(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

pub fn write_csv_string(cols: &[String], rows: &[Map<String, Value>]) -> String {
    let mut sb = String::new();
    let header: Vec<String> = cols.iter().map(|c| csv_escape_field(c)).collect();
    sb.push_str(&header.join(","));
    sb.push('\n');

    for r in rows {
        let rec: Vec<String> = cols
            .iter()
            .map(|c| csv_escape_field(&as_string(r.get(c))))
            .collect();
        sb.push_str(&rec.join(","));
        sb.push('\n');
    }
    sb
}

pub fn parse_csv_records(content: &str) -> Vec<Vec<String>> {
    let mut records = Vec::new();
    let mut current_row = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = content.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    current_field.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                current_field.push(ch);
            }
        } else {
            match ch {
                '"' => {
                    in_quotes = true;
                }
                ',' => {
                    current_row.push(current_field);
                    current_field = String::new();
                }
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current_row.push(current_field);
                    current_field = String::new();
                    if !(current_row.len() == 1 && current_row[0].is_empty()) {
                        records.push(current_row);
                    }
                    current_row = Vec::new();
                }
                '\n' => {
                    current_row.push(current_field);
                    current_field = String::new();
                    if !(current_row.len() == 1 && current_row[0].is_empty()) {
                        records.push(current_row);
                    }
                    current_row = Vec::new();
                }
                _ => {
                    current_field.push(ch);
                }
            }
        }
    }

    if !current_field.is_empty() || !current_row.is_empty() {
        current_row.push(current_field);
        if !(current_row.len() == 1 && current_row[0].is_empty()) {
            records.push(current_row);
        }
    }

    records
}

