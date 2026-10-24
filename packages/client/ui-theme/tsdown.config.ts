import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  import.meta.dirname,
  ['lib/types/index.js'],
  {
    lib: {
      copy: [{
        from: 'src/styles/{brand-font.css,montserrat-*.woff2,Montserrat-OFL.txt,inter-*.woff2,jetbrains-mono-*.woff2,Inter-OFL.txt,JetBrainsMono-OFL.txt,BLUE_NEO_DESIGN_LICENSE.txt}',
        to: 'lib/styles',
      }],
    },
  },
)
