const STYLE_ID = "v39-readable-fonts-style";

function installReadableFonts() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Keep the operation UI readable without spending extra width on padding. */
    #footSquad .squad-name{font-size:15px!important;line-height:1.15!important}
    #footSquad .squad-pos{font-size:13px!important;line-height:1!important}
    #footSquad .squad-select-btn b{font-size:15px!important}
    #footSquad .squad-select-btn small{font-size:13px!important}

    #footSquad .squad-detail-chip{font-size:13px!important;padding:3px 7px!important}
    #footSquad .squad-detail-section-title{font-size:15px!important}
    #footSquad .detail-stat span{font-size:13px!important}
    #footSquad .detail-stat b{font-size:15px!important}
    #footSquad .proficiency-item span{font-size:13px!important}
    #footSquad .proficiency-item b{font-size:15px!important}
    #footSquad .technique-card b{font-size:15px!important}
    #footSquad .technique-card small,
    #footSquad .technique-card span{font-size:13px!important}

    #footTile .land-item span{font-size:13px!important}
    #footTile .land-item b{font-size:15px!important}

    #footAction .battle-main{font-size:15px!important}
    #footAction .battle-skill b{font-size:15px!important}
    #footAction .battle-skill small{font-size:13px!important}
    #footAction .battle-selection-summary{font-size:13px!important}

    .footer-tab.footer-text-tab .tab-text{font-size:15px!important}

    @media(max-width:430px) and (orientation:portrait){
      #footSquad .squad-name{font-size:15px!important}
      #footSquad .squad-pos{font-size:13px!important}
      #footSquad .squad-detail-section-title{font-size:15px!important}
      #footSquad .detail-stat span{font-size:13px!important}
      #footSquad .detail-stat b{font-size:15px!important}
      #footSquad .proficiency-item span{font-size:13px!important}
      #footSquad .proficiency-item b{font-size:15px!important}
      #footSquad .technique-card b{font-size:15px!important}
      #footSquad .technique-card small,
      #footSquad .technique-card span{font-size:13px!important}
      #footTile .land-item span{font-size:13px!important}
      #footTile .land-item b{font-size:15px!important}
    }
  `;
  document.head.appendChild(style);
}

installReadableFonts();
