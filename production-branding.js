/* CraneGuard ERP · Branding de producción
   Oculta etiquetas técnicas internas (Build/Render/PostgreSQL) de la UI del cliente. */
(function(){
  'use strict';
  if(window.__cgProductionBranding) return;
  window.__cgProductionBranding = true;

  function cleanInternalLabels(){
    document.querySelectorAll('body *').forEach(function(node){
      if(node.children.length) return;
      const text = String(node.textContent || '').replace(/\s+/g,' ').trim();
      if(!text) return;
      if(/^BUILD\s+\d/i.test(text) || /^Build\s+\d/i.test(text) || /RENDER\s*\+\s*POSTGRESQL/i.test(text)){
        const chip = node.closest('.top-chip,.chip,.pill,.tag,.badge') || node;
        if(chip && chip !== document.body) chip.remove();
      }
    });
  }

  cleanInternalLabels();
  setTimeout(cleanInternalLabels, 150);
  setTimeout(cleanInternalLabels, 600);
  setTimeout(cleanInternalLabels, 1500);
})();
