# Per-client instance image. Paid modules are baked in at BUILD time
# (src/app/modules.ts): a module built with its flag off is not hidden —
# its code is absent from the served JavaScript entirely.
#
# Build (one image per client, flags per what they paid for):
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=<publishable-key> \
#     --build-arg VITE_MODULE_FINANZAS=true \
#     --build-arg VITE_MODULE_REPORTES=false \
#     --build-arg VITE_MODULE_REDES=false \
#     -t xinventory-clienta .
#
# Run. API_ORIGIN is where the api/ serverless functions live (e.g. the
# instance's Vercel deployment); nginx proxies /api/* there:
#   docker run -p 8080:80 -e API_ORIGIN=https://clienta.vercel.app xinventory-clienta

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Fail closed: modules are off unless the build says otherwise.
ARG VITE_MODULE_FINANZAS=false
ARG VITE_MODULE_REPORTES=false
ARG VITE_MODULE_REDES=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_MODULE_FINANZAS=$VITE_MODULE_FINANZAS \
    VITE_MODULE_REPORTES=$VITE_MODULE_REPORTES \
    VITE_MODULE_REDES=$VITE_MODULE_REDES
RUN npm run build

FROM nginx:1.27-alpine
# Placeholder keeps nginx config valid when API_ORIGIN is not provided;
# /api/* then 502s instead of the container failing to start.
ENV API_ORIGIN=http://127.0.0.1:9
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
