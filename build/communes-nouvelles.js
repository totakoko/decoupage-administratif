const {zipObject, groupBy, keyBy, chain, union} = require('lodash')
const {readSheets, getSourceFilePath} = require('./util')

const MAINTIENT_DELEGUEES = 'maintien des communes déléguées existantes'
const ASSOCIEES_DELEGUEES = 'les anciennes communes associées deviennent déléguées'

async function extractCommunesNouvellesTable() {
  const [sheet] = await readSheets(getSourceFilePath('communes_nouvelles_2018.xls'))
  const [columns, ...rows] = sheet.data
  return rows.map(row => zipObject(columns, row)).filter(r => r.NomCN)
}

async function applyChanges(communesInitiales) {
  const communesIndex = keyBy(communesInitiales, 'code')
  const communesChefLieu = groupBy(communesInitiales, c => {
    return c.chefLieu || c.communeAbsorbante
  })
  const table = await extractCommunesNouvellesTable()

  // Mise à jour des noms de commune
  table.forEach(r => {
    communesIndex[r.DepComA].nom = r.NomCA.trim()
  })

  chain(table)
    .groupBy('DepComN')
    .forEach(membres => {
      const communeNouvelle = membres.find(m => m.DepComN === m.DepComA)

      membres.forEach(m => {
        (communesChefLieu[m.DepComA] || []).forEach(c => {
          c.chefLieu = communeNouvelle.DepComN

          switch (c.type) {
            case 'commune-absorbee':
              break

            case 'commune-associee':
              c.type = communeNouvelle.Commentaire === ASSOCIEES_DELEGUEES ?
                'commune-deleguee' :
                'commune-absorbee'
              break

            case 'commune-deleguee':
              c.type = communeNouvelle.Commentaire === MAINTIENT_DELEGUEES ?
                'commune-deleguee' :
                'commune-absorbee'
              break

            default:
          }
        })

        const commune = communesIndex[m.DepComA]
        const chefLieu = communesIndex[m.DepComN]

        if (m.ChefLieu === 'O') {
          commune.chefLieu = undefined
          commune.nom = m.NomCN.trim()
          commune.type = 'commune-actuelle'
        } else {
          commune.chefLieu = m.DepComN
          commune.type = m.ComDLG === 'O' ? 'commune-deleguee' : 'commune-absorbee'
          if (chefLieu.population && commune.population) {
            chefLieu.population += commune.population
          }

          if (chefLieu.codesPostaux && commune.codesPostaux) {
            chefLieu.codesPostaux = union(chefLieu.codesPostaux, commune.codesPostaux)
          }

          delete commune.population
          delete commune.codesPostaux
        }
      })
    })
    .value()
}

module.exports = {applyChanges}
