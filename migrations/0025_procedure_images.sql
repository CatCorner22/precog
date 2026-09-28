-- Screenshots and photos attached to the steps of a business's procedures.
-- The browser re-encodes every image (which drops EXIF and GPS data) and
-- covers what the owner marked before it uploads; the server checks the
-- bytes are the type they claim and strips metadata again. Rows belong to one
-- business and go with it. Identical images in one business are stored once.

create table if not exists procedure_images (
  id text not null,
  user_id text not null,
  business_id text not null,
  content_type text not null,
  bytes bytea not null,
  byte_size integer not null,
  width integer not null,
  height integer not null,
  sha256 text not null,
  uploaded_by text,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id, id),
  constraint procedure_images_business_fk
    foreign key (user_id, business_id) references businesses ("user_id", "id") on delete cascade,
  constraint procedure_images_type_check
    check (content_type in ('image/webp', 'image/jpeg', 'image/png')),
  constraint procedure_images_size_check check (byte_size between 1 and 614400),
  constraint procedure_images_dimensions_check
    check (width between 1 and 4096 and height between 1 and 4096),
  constraint procedure_images_sha_unique unique (user_id, business_id, sha256)
);
