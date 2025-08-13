#!/bin/bash

# Enhanced Contract Hash Checker for DidRegistry
# Compares runtime bytecode with deployed bytecode from artifacts
# Handles CBOR metadata stripping for accurate verification

set -euo pipefail

# Configuration
RPC_URL="http://172.16.239.15:8545"
CONTRACT_ADDRESS="0xA5134e42CF382152894d040a0e89F2E4231062d8"
# ARTIFACT_PATH="./benchmarks/contracts/DidRegistry.json"
ARTIFACT_PATH="../smart_contracts/artifacts/contracts/did/DidRegistry.sol/DidRegistry.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Utility functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Function to validate inputs
validate_inputs() {
    if [[ ! "$CONTRACT_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        log_error "Invalid contract address format: $CONTRACT_ADDRESS"
        exit 1
    fi
    
    if [ ! -f "$ARTIFACT_PATH" ]; then
        log_error "Artifact file not found: $ARTIFACT_PATH"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    if ! command -v python3 &> /dev/null; then
        log_error "python3 is required but not installed"
        exit 1
    fi
}

# Function to get runtime bytecode from blockchain
get_runtime_code() {
    log_info "Fetching runtime bytecode from blockchain..."
    
    local response
    response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\":\"2.0\",
            \"id\":1,
            \"method\":\"eth_getCode\",
            \"params\":[\"$CONTRACT_ADDRESS\",\"latest\"]
        }")
    
    if [ $? -ne 0 ]; then
        log_error "Failed to connect to RPC endpoint"
        exit 1
    fi
    
    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [ -n "$error" ]; then
        log_error "RPC error: $error"
        exit 1
    fi
    
    local code
    code=$(echo "$response" | jq -r '.result // empty')
    if [ -z "$code" ] || [ "$code" = "null" ] || [ "$code" = "0x" ]; then
        log_error "No bytecode found at address $CONTRACT_ADDRESS"
        exit 1
    fi
    
    echo "$code"
}

# Function to get deployed bytecode from artifact
get_deployed_bytecode() {
    log_info "Extracting deployed bytecode from artifact..."
    
    local bytecode
    bytecode=$(jq -r '.deployedBytecode // empty' "$ARTIFACT_PATH" | tr -d '\n\r')
    
    if [ -z "$bytecode" ] || [ "$bytecode" = "null" ]; then
        log_error "No deployedBytecode found in artifact"
        exit 1
    fi
    
    log_info "Deployed bytecode extracted: ${#bytecode} characters"
    echo "$bytecode"
}

# Function to strip CBOR metadata from bytecode
# CBOR metadata is appended at the end of Solidity contracts
# Based on analysis: ...a2646970667358221220<32_bytes_hash>64736f6c634300<version>0033
strip_cbor_metadata() {
    local input_file="$1"
    
    python3 -c "
import sys
import re

try:
    with open('$input_file', 'r') as f:
        bytecode = f.read().strip()
    
    print(f'Input bytecode length: {len(bytecode)} characters', file=sys.stderr)
    
    if bytecode.startswith('0x'):
        bytecode = bytecode[2:]
    
    print(f'Processing {len(bytecode)} hex characters', file=sys.stderr)
    print(f'Last 100 characters: ...{bytecode[-100:]}', file=sys.stderr)
    
    # Primary CBOR pattern - matches the exact structure we observed
    # a264697066735822 + 1220 + 64_hex_chars + 64736f6c6343 + 6_hex_chars + 0033
    primary_pattern = r'a264697066735822122[0-9a-fA-F][0-9a-fA-F]{64}64736f6c6343[0-9a-fA-F]{6}0033$'
    
    match = re.search(primary_pattern, bytecode, re.IGNORECASE)
    if match:
        cbor_metadata = match.group()
        stripped = bytecode[:match.start()]
        print(f'✅ Found CBOR metadata (primary pattern): {cbor_metadata}', file=sys.stderr)
        print(f'📊 Stripped {len(bytecode) - len(stripped)} characters ({len(cbor_metadata)} chars)', file=sys.stderr)
        print(f'📏 Resulting bytecode length: {len(stripped)} characters', file=sys.stderr)
        print('0x' + stripped)
        sys.exit(0)
    
    # Alternative pattern - more flexible version detection
    alt_pattern = r'a264697066735822[0-9a-fA-F]{66}64736f6c6343[0-9a-fA-F]{6}0033$'
    
    match = re.search(alt_pattern, bytecode, re.IGNORECASE)
    if match:
        cbor_metadata = match.group()
        stripped = bytecode[:match.start()]
        print(f'✅ Found CBOR metadata (alternative pattern): {cbor_metadata}', file=sys.stderr)
        print(f'📊 Stripped {len(bytecode) - len(stripped)} characters ({len(cbor_metadata)} chars)', file=sys.stderr)
        print(f'📏 Resulting bytecode length: {len(stripped)} characters', file=sys.stderr)
        print('0x' + stripped)
        sys.exit(0)
    
    # Fallback: Look for solc compiler signature at the end
    solc_pattern = r'64736f6c6343[0-9a-fA-F]{6}0033$'
    match = re.search(solc_pattern, bytecode, re.IGNORECASE)
    if match:
        print('🔍 Found Solidity compiler signature, searching for CBOR start...', file=sys.stderr)
        
        # Look backwards for potential CBOR start markers
        cbor_starts = ['a264697066735822', 'a26469706673582212']
        
        for cbor_start in cbor_starts:
            start_pos = bytecode.rfind(cbor_start, 0, match.start())
            if start_pos != -1:
                cbor_metadata = bytecode[start_pos:]
                stripped = bytecode[:start_pos]
                print(f'✅ Found CBOR metadata (fallback): {cbor_metadata}', file=sys.stderr)
                print(f'📊 Stripped {len(bytecode) - len(stripped)} characters', file=sys.stderr)
                print(f'📏 Resulting bytecode length: {len(stripped)} characters', file=sys.stderr)
                print('0x' + stripped)
                sys.exit(0)
    
    print('❌ No CBOR metadata pattern found - returning original bytecode', file=sys.stderr)
    print('0x' + bytecode)

except Exception as e:
    print(f'Error processing bytecode: {e}', file=sys.stderr)
    sys.exit(1)
" "$input_file"
}

# Function to calculate hash
calculate_hash() {
    local bytecode="$1"
    
    echo "$bytecode" | python3 << 'EOF'
import sys
import hashlib

# Read bytecode from stdin
bytecode = sys.stdin.read().strip()

# Remove 0x prefix if present
if bytecode.startswith('0x'):
    bytecode = bytecode[2:]

# Validate hex string
try:
    bytes.fromhex(bytecode)
except ValueError as e:
    print(f"Invalid hex string: {e}", file=sys.stderr)
    sys.exit(1)

# Calculate SHA256 hash
hash_obj = hashlib.sha256(bytes.fromhex(bytecode))
print(hash_obj.hexdigest())
EOF
}

# Function to compare bytecodes with detailed analysis
compare_bytecodes() {
    local runtime_code="$1"
    local deployed_code="$2"
    
    log_info "Performing detailed bytecode comparison..."
    
    # Remove 0x prefixes for comparison
    local runtime_clean="${runtime_code#0x}"
    local deployed_clean="${deployed_code#0x}"
    
    echo "Runtime bytecode length: ${#runtime_clean} characters ($(( ${#runtime_clean} / 2 )) bytes)"
    echo "Deployed bytecode length: ${#deployed_clean} characters ($(( ${#deployed_clean} / 2 )) bytes)"
    echo "Runtime ends with: ...${runtime_clean: -100}"
    echo "Deployed ends with: ...${deployed_clean: -100}"
    
    # Direct comparison
    if [ "$runtime_clean" = "$deployed_clean" ]; then
        log_success "✅ Bytecodes match exactly!"
        return 0
    fi
    
    log_warning "❌ Bytecodes don't match exactly. Attempting CBOR metadata stripping..."
    
    # Strip CBOR metadata from both runtime and deployed bytecode
    log_info "Stripping CBOR metadata from runtime bytecode..."
    local runtime_stripped
    local temp_file_runtime="/tmp/runtime_bytecode_$$.txt"
    echo "$runtime_code" > "$temp_file_runtime"
    runtime_stripped=$(strip_cbor_metadata "$temp_file_runtime")
    rm -f "$temp_file_runtime"
    
    if [ -z "$runtime_stripped" ]; then
        log_error "Failed to strip CBOR metadata from runtime bytecode"
        return 2
    fi
    
    log_info "Stripping CBOR metadata from deployed bytecode..."
    local deployed_stripped
    
    # Create temporary file for reliable data transfer
    local temp_file="/tmp/bytecode_$$.txt"
    echo "$deployed_code" > "$temp_file"
    deployed_stripped=$(strip_cbor_metadata "$temp_file")
    rm -f "$temp_file"
    
    if [ -z "$deployed_stripped" ]; then
        log_error "Failed to strip CBOR metadata - got empty result"
        return 2
    fi
    
    local deployed_stripped_clean="${deployed_stripped#0x}"
    local runtime_stripped_clean="${runtime_stripped#0x}"
    
    echo "Runtime bytecode (stripped) length: ${#runtime_stripped_clean} characters ($(( ${#runtime_stripped_clean} / 2 )) bytes)"
    echo "Deployed bytecode (stripped) length: ${#deployed_stripped_clean} characters ($(( ${#deployed_stripped_clean} / 2 )) bytes)"
    
    # Compare again after stripping both
    if [ "$runtime_stripped_clean" = "$deployed_stripped_clean" ]; then
        log_success "✅ Bytecodes match after CBOR metadata stripping from both!"
        return 0
    fi
    
    log_warning "❌ Bytecodes still don't match after CBOR stripping"
    echo "Runtime (stripped) length: ${#runtime_stripped_clean}, Deployed (stripped) length: ${#deployed_stripped_clean}"
    
    # Check if they have different lengths
    if [ ${#runtime_stripped_clean} -ne ${#deployed_stripped_clean} ]; then
        local length_diff=$(( ${#deployed_stripped_clean} - ${#runtime_stripped_clean} ))
        log_info "Length difference: $length_diff characters"
        
        if [ $length_diff -gt 0 ]; then
            echo "Deployed bytecode is longer by $length_diff characters"
            echo "Extra data at end of deployed: ${deployed_stripped_clean: -$(( length_diff * 2 ))}"
        else
            echo "Runtime bytecode is longer by $(( -length_diff )) characters"
            echo "Extra data at end of runtime: ${runtime_stripped_clean: -$(( -length_diff * 2 ))}"
        fi
    fi
    
    # Check if runtime is a subset of deployed (in case of constructor args)
    # First check if deployed contains runtime (common case - constructor args in deployed)
    if [[ "$deployed_stripped_clean" == *"$runtime_stripped_clean"* ]]; then
        log_success "✅ Runtime bytecode found within deployed bytecode (after CBOR stripping)"
        log_info "This indicates constructor arguments or deployment code appended to deployed bytecode"
        
        # Find where the runtime code starts in deployed code
        local runtime_start_pos
        runtime_start_pos=$(python3 -c "
deployed = '$deployed_stripped_clean'
runtime = '$runtime_stripped_clean'
pos = deployed.find(runtime)
print(pos if pos != -1 else -1)
")
        if [ "$runtime_start_pos" != "-1" ]; then
            log_info "Runtime code starts at position $runtime_start_pos in deployed bytecode"
            if [ "$runtime_start_pos" -eq 0 ]; then
                log_info "Runtime code starts at beginning - deployed has additional data at end"
            else
                log_info "Runtime code starts after position $runtime_start_pos - deployed has prefix data"
            fi
        fi
        return 0
    # Check reverse case - runtime contains deployed
    elif [[ "$runtime_stripped_clean" == *"$deployed_stripped_clean"* ]]; then
        log_success "✅ Deployed bytecode found within runtime bytecode (after CBOR stripping)"
        log_info "This indicates runtime has additional code beyond the deployed contract"
        return 0
    # Check if they start with the same pattern (common runtime vs deployed difference)
    elif [ "${runtime_stripped_clean:0:1000}" = "${deployed_stripped_clean:0:1000}" ]; then
        log_success "✅ Bytecodes have identical beginning (first 1000 chars match)"
        log_info "This suggests compatible contract code with deployment differences at the end"
        return 0
    fi
    
    # Find common prefix
    local i=0
    local min_len=$(( ${#runtime_stripped_clean} < ${#deployed_stripped_clean} ? ${#runtime_stripped_clean} : ${#deployed_stripped_clean} ))
    
    while [ $i -lt $min_len ]; do
        if [ "${runtime_stripped_clean:$i:1}" != "${deployed_stripped_clean:$i:1}" ]; then
            break
        fi
        ((i++))
    done
    
    if [ $i -gt 0 ]; then
        log_warning "⚠️  Bytecodes have common prefix of $i characters ($(( i / 2 )) bytes)"
        log_info "First difference at position $i"
        if [ $i -lt ${#runtime_stripped_clean} ]; then
            echo "Runtime continues with: ${runtime_stripped_clean:$i:20}..."
        fi
        if [ $i -lt ${#deployed_stripped_clean} ]; then
            echo "Deployed continues with: ${deployed_stripped_clean:$i:20}..."
        fi
    else
        log_error "❌ Bytecodes are completely different!"
    fi
    
    return 2
}

# Main execution function
main() {
    echo "=================================================="
    echo "    DidRegistry Contract Hash Checker v2.0"
    echo "=================================================="
    echo "Contract Address: $CONTRACT_ADDRESS"
    echo "RPC Endpoint: $RPC_URL"
    echo "Artifact Path: $ARTIFACT_PATH"
    echo ""
    
    # Validate inputs
    validate_inputs
    
    # Get runtime bytecode
    local runtime_code
    runtime_code=$(get_runtime_code)
    log_success "Runtime bytecode retrieved (${#runtime_code} characters)"
    
    # Get deployed bytecode from artifact
    local deployed_code
    deployed_code=$(get_deployed_bytecode)
    log_success "Deployed bytecode retrieved from artifact (${#deployed_code} characters)"
    
    # Compare bytecodes
    compare_bytecodes "$runtime_code" "$deployed_code"
    local comparison_result=$?
    
    echo ""
    echo "=================================================="
    echo "           Hash Calculation Results"
    echo "=================================================="
    
    # Calculate hashes
    log_info "Calculating runtime bytecode hash..."
    local runtime_hash
    runtime_hash=$(calculate_hash "$runtime_code")
    echo "Runtime Hash (SHA256): $runtime_hash"
    
    # Calculate hash of stripped runtime bytecode
    log_info "Calculating stripped runtime bytecode hash..."
    local runtime_stripped_hash
    # If we don't have stripped runtime, try to strip it now
    local temp_file_runtime="/tmp/runtime_final_$$.txt"
    echo "$runtime_code" > "$temp_file_runtime"
    local runtime_for_hash
    runtime_for_hash=$(strip_cbor_metadata "$temp_file_runtime")
    rm -f "$temp_file_runtime"
    runtime_stripped_hash=$(calculate_hash "$runtime_for_hash")
    echo "Runtime Hash (Stripped, SHA256): $runtime_stripped_hash"
    
    log_info "Calculating deployed bytecode hash..."
    local deployed_hash
    deployed_hash=$(calculate_hash "$deployed_code")
    echo "Deployed Hash (SHA256): $deployed_hash"
    
    # Calculate hash of stripped deployed bytecode
    log_info "Calculating stripped deployed bytecode hash..."
    local deployed_stripped
    
    # Create temporary file for reliable data transfer
    local temp_file="/tmp/bytecode_stripped_final_$$.txt"
    echo "$deployed_code" > "$temp_file"
    deployed_stripped=$(strip_cbor_metadata "$temp_file")
    rm -f "$temp_file"
    
    local deployed_stripped_hash
    deployed_stripped_hash=$(calculate_hash "$deployed_stripped")
    echo "Deployed Hash (Stripped, SHA256): $deployed_stripped_hash"
    
    echo ""
    echo "=================================================="
    echo "              Final Results"
    echo "=================================================="
    
    if [ "$runtime_stripped_hash" = "$deployed_stripped_hash" ]; then
        log_success "🎉 VERIFICATION SUCCESSFUL!"
        log_success "DidRegistry runtime bytecode matches deployed bytecode (after CBOR stripping)"
        echo "✅ Contract verification: PASSED"
        exit 0
    elif [ "$runtime_hash" = "$deployed_hash" ]; then
        log_success "🎉 VERIFICATION SUCCESSFUL!"
        log_success "DidRegistry runtime bytecode matches deployed bytecode exactly"
        echo "✅ Contract verification: PASSED"
        exit 0
    elif [ "$runtime_hash" = "$deployed_stripped_hash" ]; then
        log_success "🎉 VERIFICATION SUCCESSFUL!"
        log_success "DidRegistry runtime bytecode matches deployed bytecode (deployed had CBOR metadata)"
        echo "✅ Contract verification: PASSED"
        exit 0
    else
        log_error "❌ VERIFICATION FAILED!"
        log_error "DidRegistry runtime bytecode does not match deployed bytecode"
        echo "❌ Contract verification: FAILED"
        
        # Provide debugging information
        echo ""
        echo "Debugging Information:"
        echo "- Runtime hash:              $runtime_hash"
        echo "- Runtime hash (stripped):   $runtime_stripped_hash"
        echo "- Deployed hash:             $deployed_hash"
        echo "- Deployed hash (stripped):  $deployed_stripped_hash"
        
        exit 1
    fi
}

# Execute main function
main "$@"
