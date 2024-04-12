// ==UserScript==
// @name        Download documents from postbox - ing.de
// @namespace   https://github.com/ja-ka/violentmonkey
// @match       https://banking.ing.de/app/postbox/postbox?*
// @match       https://banking.ing.de/app/postbox/postbox_archiv?*
// @grant       GM_download
// @grant       GM_getValue
// @grant       GM_setValue
//
//              https://github.com/Stuk/jszip/issues/909 and https://github.com/Tampermonkey/tampermonkey/issues/1600
// @require     data:application/javascript,window.setImmediate%20%3D%20window.setImmediate%20%7C%7C%20((f%2C%20...args)%20%3D%3E%20window.setTimeout(()%20%3D%3E%20f(args)%2C%200))%3B
// @require     https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @require     https://cdn.jsdelivr.net/combine/npm/@violentmonkey/dom@1,npm/@violentmonkey/ui@0.5
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.0/FileSaver.min.js
//
// @version     1.4
// @author      Jascha Kanngießer, Alexander Eckert
// @description Places a button "Alle herunterladen" next to "Alle archivieren" and downloads all documents visible on the page.
// @icon        https://www.ing.de/favicon-32x32.png
// @run-at      document-end
// @downloadURL https://raw.githubusercontent.com/ja-ka/violentmonkey/master/ing-postbox-download-all.js
// @supportURL  https://github.com/ja-ka/violentmonkey
// @homepageURL https://github.com/ja-ka/violentmonkey
// ==/UserScript==

(function () {
  $(document).ready(async () => {
    const NAME = "Alle herunterladen";

    const download = async (url, name, zip) => {
      await new Promise((r) => setTimeout(r, 100))
      return new Promise((resolve, reject) => {
        $.ajax({
          url: url,
          type: "GET",
          headers:{'Content-Type':'application/pdf'},
          cache:false,
          xhrFields:{ responseType: 'blob' },
          success: (content) => {
              zip.file(name, content, {binary: true});
              resolve();
          },
          error: (response) => reject(response)
        })
      })
    };

    let abort = false;
    let loading = false;
    const FILENAME_TEMPLATE_KEY = "FILENAME_TEMPLATE";
    let filenameTemplate = GM_getValue(FILENAME_TEMPLATE_KEY, "YYYY-MM-DD_ART_BETREFF");

    const addButton = (name, onClick) => {
      $('.account-filters').after(VM.createElement("button", {
        className: "content-header__button gap-left-1",
        style: {
          borderRadius: "6px",
          fontSize: "14px",
          fontSize: ".875rem",
          lineHeight: "20px",
          padding: "7px 14px 6px",
          margin: "0px",
          marginBottom: "25px",
          marginRight: "10px"
        },
        onClick
      }, name));  
    }
    
    addButton("Dateinamen ändern", async function() {
      const newFilenameTemplate = prompt("Bitte gib ein Dateiname-Template ein:", filenameTemplate);
      
      if (newFilenameTemplate === null) {
        return;
      }
      
      if (!['DD', 'MM', 'YYYY', 'ART', 'BETREFF'].every((curr) => {
        return newFilenameTemplate.includes(curr);
      })) {
        alert('Bitte gib ein Template nach folgendem Muster ein: YYYY-MM-DD_ART_BETREFF');
        return;
      }
      
      GM_setValue(FILENAME_TEMPLATE_KEY, newFilenameTemplate);
      filenameTemplate = newFilenameTemplate;
    });     
    
    addButton(NAME, async function() {
      if (loading) {
        abort = true;
        return;
      }

      loading = true;

      try {
        let downloaded = 0;
        const rows = $('div.ibbr-table-row');

        const setProgress = () => {
          downloaded += 1;
          this.innerHTML = `${downloaded} / ${rows.length} verarbeitet (erneut klicken um abzubrechen)`;
        };

        const downloads = 
          rows
            .map(function() {
              const nameSegments = $(this).find('> span.ibbr-table-cell > span')
                .filter(function() {
                  return $(this).text().trim() !== "|";
                })
                .map(function() {
                  return $(this).text().trim().replace(/[^A-Za-z0-9]/g, '_').replace('/\n/g', '');
                })
                .get();

              const [day, month, year] = nameSegments.shift().split('_');
              const [type, subject] = nameSegments;
              const name = `${filenameTemplate
                .replace('DD', day)
                .replace('MM', month)
                .replace('YYYY', year)
                .replace('ART', type)
                .replace('BETREFF', subject)}.pdf`;
              const date = `${year}-${month}-${day}`

              const url = "https://banking.ing.de/app/postbox" + $(this).find('a:contains(Download)').first().attr('href').substring(1);
              return { url, name, date };
            })
            .get();
        const dates = downloads.map((d) => d.date).sort()

        const zip = new JSZip()
        for (const d of downloads) {
          if (abort) {
            break;  
          }

          setProgress();
          await download(d.url, d.name, zip);
        }

        this.innerHTML = 'Erstelle ZIP-Datei…'
        zip.generateAsync({ type: "blob" }).then((content) => {
          saveAs(content, `Alle Dokumente von ${dates[0]} bis ${dates.at(-1)}`);
          this.innerHTML = NAME
        })
      } catch (err) {
        alert("Es ist ein Fehler aufgetreten.", err);
        this.innerHTML = NAME;
      }

      abort = false;
      loading = false;
    });    
  })
})();
