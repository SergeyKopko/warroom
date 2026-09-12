CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  chain_id integer NOT NULL,
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_number bigint NOT NULL CHECK (block_number >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  event_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('launch','mint','rank','upgrade','extra','reward','round')),
  actor text CHECK (actor IS NULL OR actor ~ '^0x[0-9a-f]{40}$'),
  commander_id numeric(78,0),
  title text NOT NULL,
  detail text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  block_timestamp timestamptz NOT NULL,
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contract_address, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS activity_events_order_idx ON activity_events (block_number DESC, log_index DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_events_block_number_idx ON activity_events (block_number DESC);
CREATE INDEX IF NOT EXISTS activity_events_block_timestamp_idx ON activity_events (block_timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_commander_idx ON activity_events (commander_id, block_number DESC);
CREATE INDEX IF NOT EXISTS activity_events_actor_idx ON activity_events (actor, block_number DESC);
CREATE INDEX IF NOT EXISTS activity_events_kind_idx ON activity_events (kind, block_number DESC);
CREATE INDEX IF NOT EXISTS activity_events_transaction_log_idx ON activity_events (transaction_hash, log_index);

CREATE TABLE IF NOT EXISTS indexer_state (
  chain_id integer NOT NULL,
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  last_scanned_block bigint NOT NULL CHECK (last_scanned_block >= 0),
  last_block_hash text NOT NULL CHECK (last_block_hash ~ '^0x[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, contract_address)
);

CREATE TABLE IF NOT EXISTS indexer_locks (
  chain_id integer NOT NULL,
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  owner_token text NOT NULL,
  locked_until timestamptz NOT NULL,
  PRIMARY KEY (chain_id, contract_address)
);
