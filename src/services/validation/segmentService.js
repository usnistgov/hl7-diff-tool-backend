const DatatypeService = require("./datatypeService");
const ValuesetService = require("./valuesetService");
const ComparisonService = require("../comparisonService");

let SegmentService = {
  populateSegmentsMap: function(segmentsMap, igId, segments) {
    if (segments) {
      if (!segmentsMap[igId]) {
        segmentsMap[igId] = {};
      }
      segments.forEach(segment => {
        const segId = segment["$"].ID;
        if (!segmentsMap[igId][segId]) {
          segmentsMap[igId][segId] = this.extractSegment(segment);
        }
      });
    }
  },
  extractSegment: function(segment) {
    let result = {};
    if (segment) {
      result = {
        id: segment["$"].ID,
        title: segment["$"].Label,
        name: segment["$"].Name,
        description: segment["$"].Description,
        label: segment["$"].Label,
        version: segment["$"].Version,
        children: this.extractFields(segment.Field),
        conformanceStatements: segment.conformanceStatements ? segment.conformanceStatements : []
      };
     
      if (segment.Reasons && segment.Reasons[0] && segment.Reasons[0].Reason) {
        let reasonsMap = {};
        const reasonsForChange = segment.Reasons[0].Reason;
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
        result.fieldReasons = reasonsMap;
      }
    }
    return result;
  },
  extractFields: function(fields) {
    let result = [];
    if (fields) {
      fields.forEach(field => {
        result.push({
          name: field["$"].Name,
          usage: field["$"].Usage,
          datatype: field["$"].Datatype,
          confLength: field["$"].ConfLength,
          minLength: field["$"].MinLength,
          maxLength: field["$"].MaxLength,
          min: field["$"].Min,
          max: field["$"].Max,
          position: field["$"].position,
          binding: field["$"].Binding,
          bindingStrength: field["$"].BindingStrength,
          bindingLocation: field["$"].BindingLocation,
          predicate: field["$"].predicate
        });
      });
    }
    return result;
  },
  populateConformanceStatements: function( conformanceStatements) {
    let results = [];
    if (conformanceStatements) {
      conformanceStatements.forEach(conformanceStatement => {
        let diff = {
          data: {
            id: conformanceStatement.id,
            description: {
              src: { value: conformanceStatement.description },
              derived: {}
            }
          }
      
        };
        results.push(diff);
      });
    }
    return results;
  },
  populateSrcFields: function(
    igId,
    fields,
    configuration,
    path,
    datatypesMap,
    valuesetsMap
  ) {
    let results = [];
    fields.forEach(field => {
      let currentPath = path;
      currentPath += `.${field.position}`;
      let fieldDifferential = {
        data: {
          name: {
            src: {
              value: field.name
            },
            derived: {}
          },
          position: field.position,
          type: "field",
          path: currentPath,
          changeTypes: []

        },
        changed: false,
        changeTypes: []

      };

      if (configuration.usage) {
        fieldDifferential.data.usage = {
          src: {
            value: field.usage
          },
          derived: {}
        };
      }
      if (configuration.predicate) {
        fieldDifferential.data.predicate = {
          src: {
            value: field.predicate
          },
          derived: {}
        };
      }
      if (configuration.cardinality) {
        const card = ComparisonService.createCard(field.min, field.max);

        fieldDifferential.data.cardinality = {
          src: {
            value: card
          },
          derived: {}
        };
      }
      if (configuration.datatype) {
        fieldDifferential.data.datatype = {
          src: {
            value: field.datatype
          },
          derived: {}
        };
      }
      if (configuration.valueset) {
        if (field.binding) {
          fieldDifferential.data.bindings = ValuesetService.populateSrcValuesetsValidation(
            igId,
            field,
            configuration,
            valuesetsMap
          );
        }
      }

      if (
        datatypesMap[igId][field.datatype].children &&
        datatypesMap[igId][field.datatype].children.length > 0
      ) {
        fieldDifferential.children = DatatypeService.populateSrcDatatypes(
          igId,
          datatypesMap[igId][field.datatype].children,
          configuration,
          currentPath,
          datatypesMap,
          1,
          valuesetsMap
        );
      }

      results.push(fieldDifferential);
    });
    return results;
  }
};

module.exports = SegmentService;
