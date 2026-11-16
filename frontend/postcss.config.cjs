// postcss.config.cjs — CSS post-processing that Mantine needs (picked up by Vite automatically).
//
// ".cjs" because package.json says "type": "module" and this file uses CommonJS `module.exports`.
//
//   postcss-preset-mantine  adds the helpers used in our *.module.css files:
//                             rem(16px), light-dark(lightValue, darkValue), @mixin hover / light / dark ...
//   postcss-simple-vars     lets CSS use Mantine's breakpoints as $variables in media queries:
//                             @media (max-width: $mantine-breakpoint-sm) { ... }
//                           (CSS custom properties cannot be used inside a media query, hence this plugin.)
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
}
