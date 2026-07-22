-- Later Hostinger/MySQL schema. Use utf8mb4 for Kurdish/Arabic/English names.
create table if not exists users (
  id char(36) primary key,
  email varchar(255) unique,
  display_name varchar(180),
  avatar_url text,
  role enum('user','admin') not null default 'user',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists places (
  id char(36) primary key,
  owner_id char(36) null,
  name_ku varchar(180) not null,
  name_ar varchar(180) null,
  name_en varchar(180) null,
  category varchar(80) not null default 'place',
  category_ku varchar(120) null,
  admin_governorate_ku varchar(120) null,
  admin_district_ku varchar(120) null,
  latitude decimal(10,7) not null,
  longitude decimal(10,7) not null,
  min_zoom decimal(4,2) not null default 11.50,
  priority decimal(8,3) not null default 260,
  status enum('pending','published','rejected','archived') not null default 'pending',
  rejection_reason text null,
  source_note text null,
  metadata json null,
  reviewed_by char(36) null,
  reviewed_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  index places_status_idx(status),
  index places_owner_idx(owner_id),
  index places_coordinates_idx(latitude,longitude),
  index places_name_ku_idx(name_ku),
  constraint places_owner_fk foreign key(owner_id) references users(id) on delete set null,
  constraint places_reviewer_fk foreign key(reviewed_by) references users(id) on delete set null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists favorites (
  user_id char(36) not null,
  place_id char(36) not null,
  created_at timestamp not null default current_timestamp,
  primary key(user_id,place_id),
  constraint favorites_user_fk foreign key(user_id) references users(id) on delete cascade,
  constraint favorites_place_fk foreign key(place_id) references places(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
