
## Generating the keys/certs

```
CAROOT=$(pwd)/hack/tls mkcert -key-file hack/tls/server.key -cert-file hack/tls/server.pem localhost 127.0.0.1 ::1
```