# Build stage
FROM rust:1.75 as builder

WORKDIR /usr/src/skyfly-core

# Copy source code
COPY . .

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /usr/src/skyfly-core/target/release/skyfly-core /app/skyfly-core

# Make it executable
RUN chmod +x /app/skyfly-core

# Set environment variables
ENV RUST_LOG=info

# Expose port (for future HTTP API)
EXPOSE 8080

# Run the binary
CMD ["./skyfly-core", "--help"]