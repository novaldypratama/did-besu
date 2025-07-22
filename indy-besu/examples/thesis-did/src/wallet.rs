use indy_besu_vdr::{Address, BasicSigner};

pub struct BesuWallet {
    pub account: Address,
    pub secpkey: String,
    pub signer: BasicSigner,
}

impl BesuWallet {
    pub fn new(private_key: Option<&str>) -> BesuWallet {
        let mut signer = BasicSigner::new().unwrap();
        let (account, public_key) = signer.create_key(private_key).unwrap();
        let secpkey = bs58::encode(public_key).into_string();
        BesuWallet {
            account,
            secpkey,
            signer,
        }
    }
}
