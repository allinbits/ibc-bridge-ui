//go:build ignore

// Run inside gno-eth-ibc/relayer:
// go run /absolute/path/to/bridge-ui/scripts/reference-vector.go eth/abi/ICS20Transfer.json
package main

import (
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// Field order and types match relayer/eth/erc20.go sendTransferMsg.
type sendTransferMsg struct {
	Denom common.Address
	Amount *big.Int
	Receiver string
	SourceClient string
	DestPort string
	TimeoutTimestamp uint64
	Memo string
}

func main() {
	raw, err := os.ReadFile(os.Args[1]); if err != nil { panic(err) }
	contract, err := abi.JSON(strings.NewReader(string(raw))); if err != nil { panic(err) }
	vectors := []map[string]string{}
	for _, input := range []struct{ token, denom, amount string }{
		{"TERC", "0xBb30A5eEC397174d5DA58C4D180459DA51114988", "10000000000000000000"},
		{"GNOT", "0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212", "5000000"},
	} {
		amount, _ := new(big.Int).SetString(input.amount, 10)
		msg := sendTransferMsg{common.HexToAddress(input.denom), amount,
			"g1kg6w7a4f0kup8wj9y33jdkqvvux7n559avyzcs", "client-0", "transfer", 1792645375, ""}
		data, err := contract.Pack("sendTransfer", msg); if err != nil { panic(err) }
		vectors = append(vectors, map[string]string{"token": input.token, "amount": input.amount,
			"receiver": msg.Receiver, "timeout": "1792645375", "calldata": "0x"+hex.EncodeToString(data)})
	}
	enc := json.NewEncoder(os.Stdout); enc.SetIndent("", "  "); if err := enc.Encode(vectors); err != nil { panic(err) }
}
