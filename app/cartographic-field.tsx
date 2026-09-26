type Props = {
  variant?: "world" | "strait";
  showStraitMarker?: boolean;
};

export function CartographicField({ variant = "world", showStraitMarker = false }: Props) {
  if (variant === "strait") {
    return <figure className="cartographic-field cartographic-field--regional" aria-label="Eastern strait regional reference map">
      <svg viewBox="0 0 540 250" role="img" aria-labelledby="regional-map-title">
        <title id="regional-map-title">Eastern strait regional reference map</title>
        <g className="cartographic-field__grid">{[80, 160, 240, 320, 400, 480].map((x) => <path d={`M${x} 0V250`} key={x} />)}{[50, 100, 150, 200].map((y) => <path d={`M0 ${y}H540`} key={y} />)}</g>
        <path className="cartographic-field__land" d="M0 28 92 8 168 31 205 76 187 125 147 145 126 205 54 232 0 225Z" />
        <path className="cartographic-field__land" d="M540 19 461 12 405 43 387 93 416 132 398 189 442 233 540 245Z" />
        <path className="cartographic-field__border" d="M18 83 122 78 174 108M520 83 436 76 401 103M77 30 84 203M466 40 452 213" />
        <path className="cartographic-field__route" d="M206 120 C266 103 303 105 382 126" />
        <circle className="cartographic-field__marker" cx="292" cy="114" r="4" />
        <path className="cartographic-field__annotation" d="M296 111 340 74" />
        <text className="cartographic-field__label" x="345" y="68">EASTERN STRAIT</text>
        <text className="cartographic-field__coordinate" x="18" y="236">24°N</text>
        <text className="cartographic-field__coordinate" x="476" y="236">56°E</text>
      </svg>
      <figcaption>Regional reference context</figcaption>
    </figure>;
  }

  return <figure className="cartographic-field cartographic-field--world" aria-label="World reference map">
    <svg viewBox="0 0 1200 560" role="img" aria-labelledby="world-map-title">
      <title id="world-map-title">World reference map with low-emphasis national boundaries</title>
      <g className="cartographic-field__grid">
        {[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map((x) => <path d={`M${x} 0V560`} key={x} />)}
        {[70, 140, 210, 280, 350, 420, 490].map((y) => <path d={`M0 ${y}H1200`} key={y} />)}
      </g>
      <g className="cartographic-field__land">
        <path d="M46 114 79 65 153 42 227 61 264 100 252 143 214 159 194 200 146 218 102 194 68 162Z" />
        <path d="M251 246 285 254 311 301 297 359 276 438 236 403 225 331Z" />
        <path d="M442 103 494 67 566 57 624 76 678 119 658 156 603 167 565 149 526 180 477 163 426 132Z" />
        <path d="M544 189 591 204 624 266 603 341 568 409 526 375 514 292Z" />
        <path d="M662 131 712 91 779 75 861 92 925 112 1008 144 1047 183 1014 220 949 219 902 205 860 225 792 208 751 229 695 197Z" />
        <path d="M985 286 1034 283 1088 330 1064 405 1017 421 971 371Z" />
        <path d="M1054 458 1110 447 1158 470 1126 503 1071 495Z" />
        <path d="M74 471 151 456 193 478 150 511 81 502Z" />
      </g>
      <g className="cartographic-field__border">
        <path d="M75 112 177 104 238 124M116 61 123 190M183 54 181 181M249 289 298 304M267 266 255 400M462 119 539 110 621 126M511 81 519 159M582 75 591 158M546 220 604 270M566 205 558 374M700 152 812 137 935 163 1016 184M759 95 766 204M856 91 858 215M931 113 915 216M997 301 1065 353M1020 286 1033 406" />
      </g>
      {showStraitMarker && <g className="cartographic-field__observation">
        <circle className="cartographic-field__marker" cx="792" cy="215" r="5" />
        <path className="cartographic-field__annotation" d="M797 211 842 175" />
        <text className="cartographic-field__label" x="848" y="168">EASTERN STRAIT</text>
      </g>}
      <text className="cartographic-field__coordinate" x="15" y="34">60°N</text>
      <text className="cartographic-field__coordinate" x="15" y="548">60°S</text>
      <text className="cartographic-field__coordinate" x="1050" y="548">180°E</text>
    </svg>
    <figcaption>World reference field · geographic context, not a live operational display</figcaption>
  </figure>;
}
