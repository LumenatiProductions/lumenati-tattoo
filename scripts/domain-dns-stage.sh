#!/bin/sh
# Stage lumenatitattoo.com's records in Vercel DNS BEFORE the nameservers
# move off Squarespace, so Google mail never drops. Safe to re-run (Vercel
# rejects exact duplicates). Records copied from the live Squarespace zone
# on 2026-09-02; the site A/CNAME records are served by Vercel automatically.
#
#   sh scripts/domain-dns-stage.sh
#
# Then, at Squarespace -> Domains -> lumenatitattoo.com -> DNS -> Nameservers:
#   ns1.vercel-dns.com
#   ns2.vercel-dns.com
set -e
D=lumenatitattoo.com
npx vercel dns add $D '@' MX aspmx.l.google.com 1
npx vercel dns add $D '@' MX alt1.aspmx.l.google.com 5
npx vercel dns add $D '@' MX alt2.aspmx.l.google.com 5
npx vercel dns add $D '@' MX alt3.aspmx.l.google.com 10
npx vercel dns add $D '@' MX alt4.aspmx.l.google.com 10
npx vercel dns add $D '@' TXT "v=spf1 include:_spf.google.com include:squarespace-mail.com ~all"
npx vercel dns add $D squarespace._domainkey CNAME squarespace-domainkey.squarespace-mail.com
npx vercel domains add www.$D || true
npx vercel dns ls $D
