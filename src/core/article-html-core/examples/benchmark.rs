use std::{hint::black_box, time::Instant};

fn main() {
    let samples = [
        ("short", "<p>Article text</p>".repeat(50)),
        ("medium", "<p>Article text</p>".repeat(2000)),
        (
            "near-input-limit",
            format!("<p>{}</p>", "x".repeat(65000)).repeat(4),
        ),
        ("node-limit", "<p></p>".repeat(20000)),
        ("over-limit", "x".repeat(262145)),
    ];
    for (name, source) in samples {
        let repetitions = 300;
        let start = Instant::now();
        for _ in 0..repetitions {
            black_box(article_html_core::inspect(black_box(&source)));
        }
        println!(
            "{name}: {} bytes; mean {:.3} ms ({repetitions} iterations)",
            source.len(),
            start.elapsed().as_secs_f64() * 1000.0 / f64::from(repetitions)
        );
    }
}
