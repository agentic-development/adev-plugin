resource "aws_s3_bucket" "data_lake" {
  bucket = "sample-data-lake"
}

resource "aws_glue_catalog_database" "hive_metastore" {
  name = "hive_metastore"
}
