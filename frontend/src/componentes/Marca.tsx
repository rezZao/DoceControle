// símbolo (gota entre duas folhas) e nome em duas cores; as cores vêm de variáveis do estilo.css

export function Simbolo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="650 484 634 604" aria-hidden="true" focusable="false">
      <path
        className="simbolo-gota"
        fillRule="evenodd"
        d="M968 492 L1105 668 C1128 700 1142 745 1140 792 C1082 836 1006 902 968 1005 C930 902 854 836 796 792 C794 745 808 700 831 668 Z M968 622 L1022 696 C1042 724 1050 748 1050 772 C1050 820 1014 850 968 850 C922 850 886 820 886 772 C886 748 894 724 914 696 Z"
      />
      <path className="simbolo-folha" d="M662 770 C790 792 940 880 950 1080 C770 1072 668 930 662 770 Z" />
      <path className="simbolo-folha" d="M1274 770 C1146 792 996 880 986 1080 C1166 1072 1268 930 1274 770 Z" />
    </svg>
  )
}

export function Marca() {
  return (
    <>
      <Simbolo className="marca-simbolo" />
      <span className="marca-texto">
        <span className="marca-doce">Doce</span>
        <span className="marca-controle">Controle</span>
      </span>
    </>
  )
}
