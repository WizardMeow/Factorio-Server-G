import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

export function configureProxyFromEnvironment() {
  if (!process.env.HTTP_PROXY && !process.env.HTTPS_PROXY && !process.env.http_proxy && !process.env.https_proxy) return;
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
