use crate::{
    Diagnostic, MAX_ATTRIBUTE_BYTES, MAX_ATTRIBUTES, MAX_DEPTH, MAX_INPUT_BYTES, MAX_NODES,
    MAX_TEXT_BYTES, Position, Span,
};

#[derive(Debug)]
pub struct Attribute {
    pub name: String,
    pub value: String,
    pub span: Span,
    pub value_span: Span,
}
#[derive(Debug)]
pub struct Element {
    pub name: String,
    pub attributes: Vec<Attribute>,
    pub children: Vec<usize>,
}
#[derive(Debug)]
pub enum NodeKind {
    Element(Element),
    Text(String),
}
#[derive(Debug)]
pub struct Node {
    pub kind: NodeKind,
    pub span: Span,
    pub parent: Option<usize>,
}
#[derive(Debug)]
pub struct Document {
    pub nodes: Vec<Node>,
    pub roots: Vec<usize>,
}

pub fn parse(source: &str) -> Result<Document, Box<Diagnostic>> {
    // Check length before allocating a position table or scanning unbounded input.
    let origin = Position {
        byte: 0,
        line: 1,
        column: 1,
    };
    if source.len() > MAX_INPUT_BYTES {
        return Err(Box::new(Diagnostic::error(
            "HTML_RESOURCE_LIMIT",
            "正文不能超过 256 KiB",
            Span {
                start: origin,
                end: origin,
            },
        )));
    }
    let mut parser = Parser {
        source,
        position: origin,
        nodes: Vec::new(),
        roots: Vec::new(),
        stack: Vec::new(),
    };
    while parser.peek().is_some() {
        if parser.peek() == Some('<') {
            parser.tag()?;
        } else {
            parser.text()?;
        }
    }
    if let Some(index) = parser.stack.last() {
        return Err(Box::new(Diagnostic::error(
            "HTML_UNEXPECTED_EOF",
            "元素缺少结束标签",
            parser.nodes[*index].span,
        )));
    }
    Ok(Document {
        nodes: parser.nodes,
        roots: parser.roots,
    })
}

struct Parser<'a> {
    source: &'a str,
    position: Position,
    nodes: Vec<Node>,
    roots: Vec<usize>,
    stack: Vec<usize>,
}

impl Parser<'_> {
    fn peek(&self) -> Option<char> {
        self.source[self.position.byte..].chars().next()
    }
    fn advance(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.position.byte += ch.len_utf8();
        if ch == '\n' {
            self.position.line += 1;
            self.position.column = 1;
        } else {
            self.position.column += 1;
        }
        Some(ch)
    }
    fn span(&self, start: Position) -> Span {
        Span {
            start,
            end: self.position,
        }
    }
    fn error(&self, code: &str, message: &str, start: Position) -> Box<Diagnostic> {
        Box::new(Diagnostic::error(code, message, self.span(start)))
    }
    fn space(&mut self) -> bool {
        let start = self.position.byte;
        while matches!(self.peek(), Some(' ' | '\t' | '\r' | '\n')) {
            self.advance();
        }
        self.position.byte != start
    }
    fn name(&mut self) -> Result<String, Box<Diagnostic>> {
        let start = self.position;
        if !self.peek().is_some_and(|ch| ch.is_ascii_lowercase()) {
            self.advance();
            return Err(self.error("HTML_INVALID_NAME", "名称必须使用小写 ASCII 字母", start));
        }
        while self
            .peek()
            .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        {
            self.advance();
        }
        Ok(self.source[start.byte..self.position.byte].into())
    }
    fn push(&mut self, kind: NodeKind, start: Position) -> Result<usize, Box<Diagnostic>> {
        if self.nodes.len() == MAX_NODES {
            return Err(self.error("HTML_RESOURCE_LIMIT", "正文节点数超过 20000", start));
        }
        let parent = self.stack.last().copied();
        let index = self.nodes.len();
        self.nodes.push(Node {
            kind,
            span: self.span(start),
            parent,
        });
        if let Some(parent) = parent {
            if let NodeKind::Element(element) = &mut self.nodes[parent].kind {
                element.children.push(index);
            }
        } else {
            self.roots.push(index);
        }
        Ok(index)
    }
    fn tag(&mut self) -> Result<(), Box<Diagnostic>> {
        let start = self.position;
        self.advance();
        if matches!(self.peek(), Some('!' | '?')) {
            self.advance();
            return Err(self.error(
                "HTML_UNSUPPORTED_SYNTAX",
                "不支持声明、注释、处理指令或 CDATA",
                start,
            ));
        }
        if self.peek() == Some('/') {
            return self.close(start);
        }
        if self.peek().is_none() {
            return Err(self.error("HTML_UNEXPECTED_EOF", "标签未完成", start));
        }
        let name = self.name()?;
        let mut attributes: Vec<Attribute> = Vec::new();
        loop {
            let spaced = self.space();
            match self.peek() {
                Some('>') => {
                    self.advance();
                    break;
                }
                Some('/') => {
                    self.advance();
                    return Err(self.error(
                        "HTML_SELF_CLOSING_FORBIDDEN",
                        "必须显式写出结束标签",
                        start,
                    ));
                }
                None => return Err(self.error("HTML_UNEXPECTED_EOF", "开始标签未完成", start)),
                _ => {}
            }
            if !spaced {
                self.advance();
                return Err(self.error(
                    "HTML_INVALID_NAME",
                    "属性前必须有空白，名称只能小写",
                    start,
                ));
            }
            if attributes.len() == MAX_ATTRIBUTES {
                return Err(self.error("HTML_RESOURCE_LIMIT", "单个元素最多 8 个属性", start));
            }
            let attribute = self.attribute()?;
            if attributes
                .iter()
                .any(|existing| existing.name == attribute.name)
            {
                return Err(Box::new(Diagnostic::error(
                    "HTML_DUPLICATE_ATTRIBUTE",
                    "属性不能重复",
                    attribute.span,
                )));
            }
            attributes.push(attribute);
        }
        if self.stack.len() == MAX_DEPTH {
            return Err(self.error("HTML_RESOURCE_LIMIT", "嵌套深度不能超过 64 层", start));
        }
        let index = self.push(
            NodeKind::Element(Element {
                name,
                attributes,
                children: Vec::new(),
            }),
            start,
        )?;
        self.stack.push(index);
        Ok(())
    }
    fn close(&mut self, start: Position) -> Result<(), Box<Diagnostic>> {
        self.advance();
        let name = self.name()?;
        self.space();
        if self.peek().is_none() {
            return Err(self.error("HTML_UNEXPECTED_EOF", "结束标签未完成", start));
        }
        if self.advance() != Some('>') {
            return Err(self.error("HTML_INVALID_NAME", "结束标签只能包含小写标签名", start));
        }
        let Some(index) = self.stack.pop() else {
            return Err(self.error("HTML_MISMATCHED_TAG", "没有对应的开始标签", start));
        };
        let NodeKind::Element(element) = &self.nodes[index].kind else {
            unreachable!()
        };
        if element.name != name {
            return Err(self.error("HTML_MISMATCHED_TAG", "标签没有按嵌套顺序闭合", start));
        }
        self.nodes[index].span.end = self.position;
        Ok(())
    }
    fn attribute(&mut self) -> Result<Attribute, Box<Diagnostic>> {
        let start = self.position;
        let name = self.name()?;
        self.space();
        if self.advance() != Some('=') {
            return Err(self.error("HTML_UNQUOTED_ATTRIBUTE", "属性必须显式赋值并带引号", start));
        }
        self.space();
        let quote = self.advance();
        if !matches!(quote, Some('\'' | '"')) {
            return Err(self.error("HTML_UNQUOTED_ATTRIBUTE", "属性值必须带引号", start));
        }
        let value_start = self.position;
        let mut value = String::new();
        while self.peek() != quote {
            let Some(ch) = self.peek() else {
                return Err(self.error("HTML_UNEXPECTED_EOF", "属性引号未闭合", start));
            };
            if ch == '<' || forbidden(ch) {
                self.advance();
                return Err(self.error(
                    "HTML_INVALID_ATTRIBUTE_VALUE",
                    "属性值包含不支持的字符",
                    value_start,
                ));
            }
            if ch == '&' {
                value.push(self.entity()?);
            } else {
                self.advance();
                value.push(ch);
            }
            if self.position.byte - value_start.byte > MAX_ATTRIBUTE_BYTES {
                return Err(self.error(
                    "HTML_RESOURCE_LIMIT",
                    "属性值不能超过 4096 字节",
                    value_start,
                ));
            }
        }
        let value_span = self.span(value_start);
        self.advance();
        Ok(Attribute {
            name,
            value,
            span: self.span(start),
            value_span,
        })
    }
    fn text(&mut self) -> Result<(), Box<Diagnostic>> {
        let start = self.position;
        let mut value = String::new();
        while let Some(ch) = self.peek() {
            if ch == '<' {
                break;
            }
            if forbidden(ch) {
                self.advance();
                return Err(self.error("HTML_INVALID_TEXT", "正文包含不支持的控制字符", start));
            }
            if ch == '&' {
                value.push(self.entity()?);
            } else {
                self.advance();
                value.push(ch);
            }
            if self.position.byte - start.byte > MAX_TEXT_BYTES {
                return Err(self.error(
                    "HTML_RESOURCE_LIMIT",
                    "文本节点不能超过 65536 字节",
                    start,
                ));
            }
        }
        self.push(NodeKind::Text(value), start)?;
        Ok(())
    }
    fn entity(&mut self) -> Result<char, Box<Diagnostic>> {
        let start = self.position;
        self.advance();
        let token_start = self.position.byte;
        // Unicode scalars require at most 7 decimal digits. Bound malformed entities too.
        while self
            .peek()
            .is_some_and(|ch| ch.is_ascii_alphanumeric() || ch == '#')
            && self.position.byte - token_start < 16
        {
            self.advance();
        }
        let token_end = self.position.byte;
        if self.advance() != Some(';') {
            return Err(self.error("HTML_INVALID_ENTITY", "实体未知、截断或缺少分号", start));
        }
        let token = &self.source[token_start..token_end];
        let decoded = match token {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => numeric_entity(token),
        };
        match decoded {
            Some(ch) if !forbidden(ch) => Ok(ch),
            _ => Err(self.error("HTML_INVALID_ENTITY", "实体未知或 Unicode 码点无效", start)),
        }
    }
}
fn forbidden(ch: char) -> bool {
    ch.is_control() && !matches!(ch, '\n' | '\r' | '\t')
}
fn numeric_entity(token: &str) -> Option<char> {
    let (digits, radix) = if let Some(digits) = token.strip_prefix("#x") {
        (digits, 16)
    } else {
        (token.strip_prefix('#')?, 10)
    };
    if digits.is_empty() || !digits.chars().all(|ch| ch.is_digit(radix)) {
        return None;
    }
    char::from_u32(u32::from_str_radix(digits, radix).ok()?)
}
