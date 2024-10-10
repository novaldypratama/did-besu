#!/bin/bash -eu

# Copyright 2018 ConsenSys AG.
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
# an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
# specific language governing permissions and limitations under the License.

NO_LOCK_REQUIRED=false

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/../../.env"
# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

readonly HOST="${DOCKER_PORT_2375_TCP_ADDR:-localhost}"
readonly MAX_RETRY_COUNT=50
readonly BLOCKSCOUT_DOCKER_CONFIG="${BLOCKSCOUT_DOCKER_CONFIG:-}"
readonly GRAFANA_BESU_URL="http://${HOST}:3000/d/XE4V0WGZz/besu-overview?orgId=1&refresh=10s&from=now-30m&to=now&var-system=All"
readonly GRAFANA_QUORUM_URL="http://${HOST}:3000/d/a1lVy7ycin9Yv/goquorum-overview?orgId=1&refresh=10s&from=now-30m&to=now&var-system=All"

print_header() {
  echo "*************************************"
  echo "Localnet "
  echo "*************************************"
  echo
  echo "----------------------------------"
  echo "List endpoints and services"
  echo "----------------------------------"
}

print_endpoints() {
  echo "JSON-RPC HTTP service endpoint                 : http://${HOST}:8545"
  echo "JSON-RPC WebSocket service endpoint            : ws://${HOST}:8546"
}

check_blockscout() {
  if docker-compose -f ../../docker-compose.yml -f "${BLOCKSCOUT_DOCKER_CONFIG}" ps -a -q proxy &>/dev/null; then
    echo "Blockscout address                             : http://${HOST}:26000/"
  fi
}

check_prometheus() {
  if docker compose -f ../../docker-compose.yml ps -q prometheus &>/dev/null; then
    echo "Prometheus address                             : http://${HOST}:9090/graph"
  fi
}

check_grafana() {
  if docker compose -f ../../docker-compose.yml ps -q grafana &>/dev/null; then
    local grafana_url="${GRAFANA_QUORUM_URL}"
    local grafana_loki_url="http://${HOST}:3000/d/Ak6eXLsPxFemKYKEXfcH/quorum-logs-loki?orgId=1&var-app=quorum&var-search="

    if docker ps -q --filter 'label=consensus=besu' &>/dev/null; then
      grafana_url="${GRAFANA_BESU_URL}"
      grafana_loki_url="http://${HOST}:3000/d/Ak6eXLsPxFemKYKEXfcH/quorum-logs-loki?orgId=1&var-app=besu&var-search="
    fi

    echo "Grafana address                                : ${grafana_url}"
    echo "Collated logs using Grafana and Loki           : ${grafana_loki_url}"
  fi
}

print_footer() {
  echo
  echo "For more information on the endpoints and services, refer to README.md in the installation directory."
  echo "****************************************************************"
}

main() {
  print_header
  print_endpoints
  check_blockscout
  check_prometheus
  check_grafana
  print_footer
}

main "$@"
