# Vendored third-party licences

This directory holds four unmodified-or-minimally-patched open-source
libraries, vendored rather than fetched from a CDN so the application runs
offline and so the Content-Security-Policy can forbid third-party origins.

The whole `frontend/` tree is published to GitHub Pages, which is a
redistribution. Each licence below requires its copyright notice to travel
with that redistribution; this file is where they travel.

| File | Library | Version | Licence |
| --- | --- | --- | --- |
| `three.module.js` | three.js | r160 | MIT |
| `OrbitControls.js` | three.js examples — OrbitControls | r160, import path patched | MIT |
| `cytoscape.min.js` | Cytoscape.js | 3.28.1 | MIT |
| `3dmol.min.js` | 3Dmol.js | vendored build | BSD-3-Clause |

`OrbitControls.js` is patched in exactly one way: its `three` import is
rewritten to the relative path `./three.module.js`, because the strict CSP
forbids the inline `<script type="importmap">` that the upstream file's bare
specifier would otherwise need. No behaviour is changed.

---

## three.js — MIT

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Source: https://github.com/mrdoob/three.js

---

## Cytoscape.js — MIT

Copyright © 2016-2023, The Cytoscape Consortium.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Source: https://github.com/cytoscape/cytoscape.js

The minified bundle carries this notice in its own banner; it is repeated here
so that one file covers the whole directory.

---

## 3Dmol.js — BSD-3-Clause

The minified bundle's banner reads *"For license information please see
3Dmol-min.js.LICENSE.txt"*, and that file was not vendored alongside it. The
notice is reproduced here so the redistribution is compliant.

Copyright © 2014-2023, The Regents of the University of Pittsburgh and
contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Source: https://github.com/3dmol/3Dmol.js
Citation: Rego N, Koes D. 3Dmol.js: molecular visualization with WebGL.
Bioinformatics 31(8):1322-4, 2015. https://doi.org/10.1093/bioinformatics/btu829

The bundled 3Dmol build also embeds smaller MIT-licensed components; their
notices are carried inside the bundle itself and are not reproduced here.
