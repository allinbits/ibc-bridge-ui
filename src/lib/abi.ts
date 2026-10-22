// ABI subset from gno-eth-ibc contracts/out/GnoICS20Transfer.sol and relayer/eth/abi/ICS26Router.json.
import { parseAbi } from 'viem'

export const transferAbi = [
  {
    "type": "function",
    "name": "sendTransfer",
    "inputs": [
      {
        "name": "msg_",
        "type": "tuple",
        "internalType": "struct IICS20TransferMsgs.SendTransferMsg",
        "components": [
          {
            "name": "denom",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "receiver",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "sourceClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "destPort",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timeoutTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "memo",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "error",
    "name": "AccessManagedInvalidAuthority",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AccessManagedRequiredDelay",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "delay",
        "type": "uint32",
        "internalType": "uint32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AccessManagedUnauthorized",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadLimits",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadModule",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadPacketData",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadProof",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadRoute",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoBadSettlement",
    "inputs": [
      {
        "name": "item",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoClientRetired",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoDenomNotRegistered",
    "inputs": [
      {
        "name": "denom",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoEscrowReserved",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserved",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoIncidentsPending",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "pending",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoLimitsNotSet",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoLossBooked",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "direction",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoNoNotification",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoNoSendRecord",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoNotClosed",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoNotParked",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoNotificationStarved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoOverDayCap",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "dayCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoOverMaxPerMessage",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxPerMessage",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoPayloadTooLarge",
    "inputs": [
      {
        "name": "size",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoPaymentStarved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GnoQuarantineUnknown",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoQuarantined",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "until",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoReceiveFailed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRefundFailed",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRefundsHeld",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRouteClosed",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRoutePaused",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRouteRecovering",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoRouteReopening",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoSendAboveMax",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sendMax",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "GnoSendBelowMin",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sendMin",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20DenomAlreadyExists",
    "inputs": [
      {
        "name": "denom",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20DenomNotFound",
    "inputs": [
      {
        "name": "denom",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20EscrowNotFound",
    "inputs": [
      {
        "name": "clientID",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20InvalidAddress",
    "inputs": [
      {
        "name": "addr",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20InvalidAmount",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20InvalidPort",
    "inputs": [
      {
        "name": "expected",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "actual",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20Permit2TokenMismatch",
    "inputs": [
      {
        "name": "permitToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "sentToken",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20TokenAlreadyExists",
    "inputs": [
      {
        "name": "denom",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20Unauthorized",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20UnauthorizedPacketSender",
    "inputs": [
      {
        "name": "packetSender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20UnexpectedERC20Balance",
    "inputs": [
      {
        "name": "expected",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "actual",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20UnexpectedEncoding",
    "inputs": [
      {
        "name": "expected",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "actual",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ICS20UnexpectedVersion",
    "inputs": [
      {
        "name": "expected",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringsInsufficientHexLength",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const

export const routerAbi = [
  {
    "type": "event",
    "name": "AckPacket",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "packet",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct IICS26RouterMsgs.Packet",
        "components": [
          {
            "name": "sequence",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "destClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timeoutTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "payloads",
            "type": "tuple[]",
            "internalType": "struct IICS26RouterMsgs.Payload[]",
            "components": [
              {
                "name": "sourcePort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "destPort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "version",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "encoding",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "value",
                "type": "bytes",
                "internalType": "bytes"
              }
            ]
          }
        ]
      },
      {
        "name": "acknowledgement",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SendPacket",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "packet",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct IICS26RouterMsgs.Packet",
        "components": [
          {
            "name": "sequence",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "destClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timeoutTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "payloads",
            "type": "tuple[]",
            "internalType": "struct IICS26RouterMsgs.Payload[]",
            "components": [
              {
                "name": "sourcePort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "destPort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "version",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "encoding",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "value",
                "type": "bytes",
                "internalType": "bytes"
              }
            ]
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TimeoutPacket",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "packet",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct IICS26RouterMsgs.Packet",
        "components": [
          {
            "name": "sequence",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "destClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timeoutTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "payloads",
            "type": "tuple[]",
            "internalType": "struct IICS26RouterMsgs.Payload[]",
            "components": [
              {
                "name": "sourcePort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "destPort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "version",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "encoding",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "value",
                "type": "bytes",
                "internalType": "bytes"
              }
            ]
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WriteAcknowledgement",
    "inputs": [
      {
        "name": "clientId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "sequence",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "packet",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct IICS26RouterMsgs.Packet",
        "components": [
          {
            "name": "sequence",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "destClient",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timeoutTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "payloads",
            "type": "tuple[]",
            "internalType": "struct IICS26RouterMsgs.Payload[]",
            "components": [
              {
                "name": "sourcePort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "destPort",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "version",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "encoding",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "value",
                "type": "bytes",
                "internalType": "bytes"
              }
            ]
          }
        ]
      },
      {
        "name": "acknowledgements",
        "type": "bytes[]",
        "indexed": false,
        "internalType": "bytes[]"
      }
    ],
    "anonymous": false
  }
] as const

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function mint(address,uint256)',
])
export const controlsAbi = parseAbi(['function reserved(string,address) view returns (uint256)'])
