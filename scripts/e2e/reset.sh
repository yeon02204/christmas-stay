#!/usr/bin/env bash
# 로컬 테스트 DB 초기화 (⚠️ 로컬 전용)
set -e
cd "$(dirname "$0")/../.."
cp supabase/tests/20_reset_test_data.sql /tmp/cs_reset.sql
su postgres -c "psql -q -d ${TEST_DB:-cs_test} -f /tmp/cs_reset.sql"
rm -rf .mock-storage
