CREATE TYPE "public"."MessageRole" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"page_content" text NOT NULL,
	"metadata" jsonb,
	"source" text,
	"chunk_index" integer NOT NULL,
	"role" text DEFAULT 'original' NOT NULL,
	"ref_id" integer,
	"scope" text DEFAULT 'conversation' NOT NULL,
	"category" text DEFAULT 'resume' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_document_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"global_doc_id" integer NOT NULL,
	"role" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"local_name" text NOT NULL,
	"source_user_document_id" integer,
	"content_snapshot" text,
	"created_at" bigint NOT NULL,
	"category" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"summary" text NOT NULL,
	"message_count" integer NOT NULL,
	"start_message_id" integer NOT NULL,
	"end_message_id" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"initial_prompt" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "global_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_hash" text NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"login_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "MessageRole" NOT NULL,
	"content" text NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"client_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"summarized" boolean DEFAULT false NOT NULL,
	"display_content" text,
	"attachments" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_document_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"global_doc_id" integer NOT NULL,
	"group_id" integer,
	"category" text DEFAULT 'unknown' NOT NULL,
	"group_name" text NOT NULL,
	"local_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"index_status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"chunks_count" integer DEFAULT 0 NOT NULL,
	"indexed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"global_doc_id" integer NOT NULL,
	"local_name" text NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"category" text DEFAULT 'unknown' NOT NULL,
	"markdown_content" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"read_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"phone" text,
	"email" text,
	"password" text,
	"nickname" text NOT NULL,
	"role" text DEFAULT 'normal' NOT NULL,
	"avatar" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_ref_id_conversation_document_refs_id_fk" FOREIGN KEY ("ref_id") REFERENCES "public"."conversation_document_refs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_document_refs" ADD CONSTRAINT "conversation_document_refs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_document_refs" ADD CONSTRAINT "conversation_document_refs_global_doc_id_global_documents_id_fk" FOREIGN KEY ("global_doc_id") REFERENCES "public"."global_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_document_refs" ADD CONSTRAINT "conversation_document_refs_source_user_document_id_user_documents_id_fk" FOREIGN KEY ("source_user_document_id") REFERENCES "public"."user_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_documents" ADD CONSTRAINT "system_documents_global_doc_id_global_documents_id_fk" FOREIGN KEY ("global_doc_id") REFERENCES "public"."global_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_documents" ADD CONSTRAINT "system_documents_group_id_system_document_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."system_document_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_global_doc_id_global_documents_id_fk" FOREIGN KEY ("global_doc_id") REFERENCES "public"."global_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_conversation_id_idx" ON "chunks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chunks_conversation_id_ref_id_idx" ON "chunks" USING btree ("conversation_id","ref_id");--> statement-breakpoint
CREATE INDEX "chunks_conversation_id_chunk_index_idx" ON "chunks" USING btree ("conversation_id","chunk_index");--> statement-breakpoint
CREATE INDEX "conversation_document_refs_conversation_id_idx" ON "conversation_document_refs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_document_refs_global_doc_id_idx" ON "conversation_document_refs" USING btree ("global_doc_id");--> statement-breakpoint
CREATE INDEX "conversation_document_refs_source_user_document_id_idx" ON "conversation_document_refs" USING btree ("source_user_document_id");--> statement-breakpoint
CREATE INDEX "conversation_document_refs_conversation_role_version_idx" ON "conversation_document_refs" USING btree ("conversation_id","role","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversation_document_refs_conversation_snapshot_created_at_idx" ON "conversation_document_refs" USING btree ("conversation_id","created_at" DESC NULLS LAST) WHERE "conversation_document_refs"."content_snapshot" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_summaries_conversation_id_idx" ON "conversation_summaries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "global_documents_file_hash_key" ON "global_documents" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "login_history_user_id_idx" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_unsummarized_created_at_idx" ON "messages" USING btree ("conversation_id","created_at") WHERE "messages"."summarized" = false;--> statement-breakpoint
CREATE INDEX "messages_client_id_idx" ON "messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "system_document_groups_parent_id_idx" ON "system_document_groups" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "system_documents_group_id_idx" ON "system_documents" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "system_documents_group_id_active_idx" ON "system_documents" USING btree ("group_id","active");--> statement-breakpoint
CREATE INDEX "system_documents_index_status_idx" ON "system_documents" USING btree ("index_status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_documents_user_id_global_doc_id_key" ON "user_documents" USING btree ("user_id","global_doc_id");--> statement-breakpoint
CREATE INDEX "user_documents_user_id_idx" ON "user_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_documents_global_doc_id_idx" ON "user_documents" USING btree ("global_doc_id");--> statement-breakpoint
CREATE INDEX "user_notifications_user_id_created_at_idx" ON "user_notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_notifications_user_id_read_at_idx" ON "user_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");