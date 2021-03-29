const ValuesetService = require("./valuesetService");
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
  extractDatatype: function(datatype) {
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
        result.bindings = ValuesetService.extractBindings(
          datatype.Binding[0].StructureElementBindings[0].StructureElementBinding, ""
        );
      }

    }
    return result;
  },
  extractComponents: function(components) {
    let result = [];
    if (components) {
      components.forEach(component => {
        result.push(component["$"]);
      });
    }
    return result;
  },
  populateSrcDatatypes: function(
    igId,
    components,
    configuration,
    path,
    datatypesMap,
    level,
    valuesetsMap
  ) {
    let results = [];
    components.forEach(component => {
      let currentPath = path;
      currentPath += `.${component.position}`;
      let componentDifferential = {
        data: {
          name: component.name,
          position: component.position,
          type: level === 1 ? "component" : "subcomponent",
          path: currentPath
        },
        changed: false
      };

      if (configuration.usage) {
        componentDifferential.data.usage = {
          src: {
            value: component.usage
          },
          derived: {}
        };
      }
      if (configuration.datatype) {
        componentDifferential.data.datatype = {
          src: {
            value: component.datatype
          },
          derived: {}
        };
      }
      if (
        datatypesMap[igId][component.datatype].children &&
        datatypesMap[igId][component.datatype].children.length > 0
      ) {
        componentDifferential.children = this.populateSrcDatatypes(
          igId,
          datatypesMap[igId][component.datatype].children,
          configuration,
          currentPath,
          datatypesMap,
          2,
          valuesetsMap
        );
      }
      if (configuration.valueset) {
        componentDifferential.bindings = ValuesetService.populateSrcValuesets(
          igId,
          datatypesMap[igId][component.datatype].bindings,
          configuration,
          valuesetsMap,
          "datatype_component",
        );
      }

      results.push(componentDifferential);
    });
    results.sort(function(a, b) {
      return a.data.position - b.data.position;
    });
    return results;
  },

};

module.exports = DatatypeService;
