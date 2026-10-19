const { getDefaultConfig } = require('expo/metro-config');
const https = require('https');

const config = getDefaultConfig(__dirname);

// 仅 Web 开发用: 浏览器有 CORS 限制, 通过 Metro 同源代理转发请求到学校网站。
// 原生 APP 不走此路径, 直接请求学校网站。
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (req.url && req.url.startsWith('/timetable-proxy/')) {
      const targetPath = req.url.slice('/timetable-proxy'.length);
      const proxyReq = https.request(
        {
          hostname: 'jwtk.cshbxy.com',
          path: targetPath,
          method: req.method,
          headers: { ...req.headers, host: 'jwtk.cshbxy.com' },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', (e) => {
        res.statusCode = 502;
        res.end('proxy error: ' + e.message);
      });
      req.pipe(proxyReq);
      return;
    }
    return middleware(req, res, next);
  },
};

module.exports = config;
