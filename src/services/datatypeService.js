let DatatypeService = {
  populateDatatypesMap: function(datatypesMap, igId, datatypes) {
    if (datatypes) {
      if (!datatypesMap[igId]) {
        datatypesMap[igId] = {};
      }
      datatypes.forEach(datatype => {
        const dtObject = datatype.Datatype[0];
        const dtLabel = dtObject["$"].label;

        if (!datatypesMap[igId][dtLabel]) {
          datatypesMap[igId][dtLabel] = this.extractDatatype(dtObject);
        }
      });
    }
  },
  extractDatatype(datatype) {
    let result = {};
    if (datatype) {
      result = {
        id: datatype["$"].id,
        title: datatype["$"].title,
        name: datatype["$"].name,
        description: datatype["$"].description,
        label: datatype["$"].label,
        children: this.extractComponents(datatype.Component)
      };
    }
    return result;
  },
  extractComponents(components) {
    let result = [];
    if (components) {
      components.forEach(component => {
        result.push(component["$"]);
      });
    }
    return result;
  }
};

module.exports = DatatypeService;
