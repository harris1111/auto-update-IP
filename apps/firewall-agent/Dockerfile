FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o firewall-agent ./cmd/firewall-agent

FROM alpine:3.20
RUN apk add --no-cache nftables ca-certificates
COPY --from=builder /app/firewall-agent /usr/local/bin/firewall-agent
ENTRYPOINT ["/usr/local/bin/firewall-agent"]
