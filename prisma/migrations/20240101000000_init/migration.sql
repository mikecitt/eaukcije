CREATE TABLE IF NOT EXISTS "auctions" (
    "id" TEXT NOT NULL,
    "auction_number" TEXT,
    "short_description" TEXT,
    "place_name" TEXT,
    "place_municipality" TEXT,
    "status" TEXT,
    "status_translation" TEXT,
    "starting_price" DOUBLE PRECISION,
    "start_date" TEXT,
    "end_date" TEXT,
    "property_type" TEXT,
    "is_first_sale" INTEGER NOT NULL DEFAULT 0,
    "details_fetched" INTEGER NOT NULL DEFAULT 0,
    "raw_data" TEXT,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "meta" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    CONSTRAINT "meta_pkey" PRIMARY KEY ("key")
);
