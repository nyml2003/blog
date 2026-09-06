use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let sources: Vec<String> = serde_json::from_str(&input).unwrap();
    let results: Vec<_> = sources
        .iter()
        .map(|source| article_html_core::inspect(source))
        .collect();
    println!("{}", serde_json::to_string(&results).unwrap());
}
