const SegmentService = require("./segmentService");

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
      if (
        datatype.Binding && datatype.Binding[0].StructureElementBindings &&
        datatype.Binding[0].StructureElementBindings[0] &&
        datatype.Binding[0].StructureElementBindings[0].StructureElementBinding
      ) {
        result.bindings = SegmentService.extractBindings(
          datatype.Binding[0].StructureElementBindings[0].StructureElementBinding
        );
      }

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
