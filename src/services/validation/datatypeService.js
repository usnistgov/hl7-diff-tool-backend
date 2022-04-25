const ValuesetService = require("./valuesetService");
const SegmentService = require("./segmentService");

let DatatypeService = {
  populateDatatypesMap: function(datatypesMap, igId, datatypes) {
    if (datatypes) {
      if (!datatypesMap[igId]) {
        datatypesMap[igId] = {};
      }
      datatypes.forEach(datatype => {
        const dtLabel = datatype["$"].Label + "+" + datatype["$"].Version;

        if (!datatypesMap[igId][datatype["$"].ID]) {
          datatypesMap[igId][datatype["$"].ID] = this.extractDatatype(datatype);
        }
      });
    }
  },
  extractDatatype: function(datatype) {
    let result = {};
    if (datatype) {
      result = {
        id: datatype["$"].Id,
        title: datatype["$"].Label,
        name: datatype["$"].Name,
        version: datatype["$"].Version,
        description: datatype["$"].Description,
        label: datatype["$"].Label,
        children: this.extractComponents(datatype.Component)
      };
      if (
        datatype.Reasons &&
        datatype.Reasons[0] &&
        datatype.Reasons[0].Reason
      ) {
        let reasonsMap = {};
        const reasonsForChange = datatype.Reasons[0].Reason;
        reasonsForChange.forEach(reason => {
          reason = reason["$"];
          let splits = reason.Location.split(".");
          splits.shift();
          splits = splits.join(".");
          if (!reasonsMap[splits]) {
            reasonsMap[splits] = {};
          }
          reasonsMap[splits][reason.Property.toLowerCase()] = reason.Text;
        });
        result.componentReasons = reasonsMap;
      }

    }
    return result;
  },
  extractComponents: function(components) {
    let result = [];
    if (components) {
      components.forEach(component => {
        result.push({
          name: component['$'].Name,
          usage: component['$'].Usage,
          datatype: component['$'].Datatype,
          confLength: component['$'].ConfLength,
          minLength: component['$'].MinLength,
          maxLength: component['$'].MaxLength,
          binding: component['$'].Binding,
          bindingStrength: component['$'].BindingStrength,
          bindingLocation: component['$'].BindingLocation,

          position: component['$'].position,

        });
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
        if (component.binding) {
          componentDifferential.data.bindings = ValuesetService.populateSrcValuesetsValidation(
            igId,
            component,
            configuration,
            valuesetsMap,
          );
        }

      }

      results.push(componentDifferential);
    });
    results.sort(function(a, b) {
      return a.data.position - b.data.position;
    });
    return results;
  }
};

module.exports = DatatypeService;
