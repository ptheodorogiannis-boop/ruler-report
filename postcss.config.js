const path = require('path');

// Absolute config path so the build works no matter which directory the dev server is launched from.
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
