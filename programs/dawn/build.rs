use std::fs;
use std::env;
use std::path::Path;
use toml::Value;

fn main() {
    // Read Anchor.toml
    let contents = fs::read_to_string("../../Anchor.toml")
        .expect("Should have been able to read Anchor.toml");

    let value = contents.parse::<Value>()
        .expect("Should have been able to parse TOML");

    // Get program ID based on feature
    let program_id = if cfg!(feature = "devnet") {
        value["programs"]["devnet"]["dawn"]
            .as_str()
            .expect("Should have program ID for devnet")
    } else {
        value["programs"]["localnet"]["dawn"]
            .as_str()
            .expect("Should have program ID for localnet")
    };

    // Generate the program ID module
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("program_id.rs");
    fs::write(
        dest_path,
        format!("declare_id!(\"{}\");", program_id)
    ).unwrap();
}