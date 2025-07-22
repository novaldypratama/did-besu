use crate::wallet::BesuWallet;
use indy_besu_vdr::{
    credential_definition_registry::{
        build_create_credential_definition_transaction, resolve_credential_definition,
    },
    did_ethr_registry::build_did_set_attribute_transaction,
    role_control::build_assign_role_transaction,
    schema_registry::{build_create_schema_transaction, resolve_schema},
    Address, ContractConfig, DidDocAttribute, Ed25519Signature, LedgerClient, LegacyDid,
    LegacyVerkey, ResourceIdentifier, Role, Status, Transaction, Validity,
};
use std::{env, fs, str::FromStr, time::Duration};

pub struct BesuLedger {
    pub client: LedgerClient,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BesuContractConfig {
    address: String,
    spec_path: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BesuConfig {
    chain_id: u64,
    node_address: String,
    contracts: BesuContracts,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BesuContracts {
    ethereum_did_registry: BesuContractConfig,
    schema_registry: BesuContractConfig,
    role_control: BesuContractConfig,
    validator_control: BesuContractConfig,
    account_control: BesuContractConfig,
    upgrade_control: BesuContractConfig,
    universal_did_resolver: BesuContractConfig,
}

fn build_contract_path(contract_path: &str) -> String {
    let mut cur_dir = env::current_dir().unwrap();
    cur_dir.push("../");
    cur_dir.push(contract_path);
    fs::canocialize(&cur_dir)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string()
}

impl BesuLedger {
    fn contracts(contracts: &BesuContracts) -> Vec<ContractConfig> {
        vec![
            ContractConfig {
                address: contracts.ethereum_did_registry.address.to_string(),
                spec_path: Some(build_contract_path(
                    contracts.ethereum_did_registry.spec_path.as_str(),
                )),
                spec: None,
            },
            ContractConfig {
                address: contracts.schema_registry.address.to_string(),
                spec_path: Some(build_contract_path(
                    contracts.schema_registry.spec_path.as_str(),
                )),
                spec: None,
            },
            ContractConfig {
                address: contracts.cred_def_registry.address.to_string(),
                spec_path: Some(build_contract_path(
                    contracts.cred_def_registry.spec_path.as_str(),
                )),
                spec: None,
            },
            ContractConfig {
                address: contracts.role_control.address.to_string(),
                spec_path: Some(build_contract_path(
                    contracts.role_control.spec_path.as_str(),
                )),
                spec: None,
            },
            ContractConfig {
                address: contracts.legacy_mapping_registry.address.to_string(),
                spec_path: Some(build_contract_path(
                    contracts.legacy_mapping_registry.spec_path.as_str(),
                )),
                spec: None,
            },
        ]
    }
}
