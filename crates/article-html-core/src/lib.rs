//! The strict article fragment language. Source is never rewritten.
mod parser;
mod profile;

use serde::{Deserialize, Serialize};
pub use parser::{Attribute, Document, Element, Node, NodeKind, parse};

pub const PROFILE_VERSION: &str = "article-html/v1";
pub const MAX_INPUT_BYTES: usize = 262_144;
pub const MAX_DEPTH: usize = 64;
pub const MAX_NODES: usize = 20_000;
pub const MAX_ATTRIBUTES: usize = 8;
pub const MAX_ATTRIBUTE_BYTES: usize = 4096;
pub const MAX_TEXT_BYTES: usize = 65536;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub byte: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Span {
    pub start: Position,
    pub end: Position,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub span: Span,
    pub profile_version: String,
}

impl Diagnostic {
    fn error(code: &str, message: &str, span: Span) -> Self {
        Self {
            code: code.into(), severity: "error".into(), message: message.into(), span,
            profile_version: PROFILE_VERSION.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub profile_version: String,
    pub valid: bool,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn inspect(source: &str) -> Inspection {
    let diagnostic = match parse(source) {
        Ok(document) => profile::validate(&document),
        Err(diagnostic) => Some(diagnostic),
    };
    Inspection {
        profile_version: PROFILE_VERSION.into(),
        valid: diagnostic.is_none(),
        diagnostics: diagnostic.into_iter().collect(),
    }
}
