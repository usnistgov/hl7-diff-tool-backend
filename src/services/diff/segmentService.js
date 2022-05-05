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
        const segId = segment["$"].id;
        if (!segmentsMap[igId][segId]) {
          segmentsMap[igId][segId] = this.extractSegment(segment.Segment[0]);
        }
      });
    }
  },
  extractSegment: function(segment) {
    let result = {};
    if (segment) {
      result = {
        id: segment["$"].id,
        title: segment["$"].title,
        name: segment["$"].name,
        description: segment["$"].description,
        label: segment["$"].label,
        children: this.extractFields(segment.Fields[0].Field)
      };
      if (segment.Constraints && segment.Constraints[0] && segment.Constraints[0].ConformanceStatement) {
        let conformanceStatements = [];
        segment.Constraints[0].ConformanceStatement.forEach(
          conformanceStatement => {
            let diff = {
              id: conformanceStatement["$"].identifier,
              description: conformanceStatement["$"].description
            };
            conformanceStatements.push(diff);
          }
        );
        result.conformanceStatements = conformanceStatements;
      }
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
      if (
        segment.Binding &&
        segment.Binding[0].StructureElementBindings &&
        segment.Binding[0].StructureElementBindings[0] &&
        segment.Binding[0].StructureElementBindings[0].StructureElementBinding
      ) {
        result.bindings = ValuesetService.extractBindings(
          segment.Binding[0].StructureElementBindings[0]
            .StructureElementBinding,
          ""
        );
      }
    }
    return result;
  },
  extractFields: function(fields) {
    let result = [];
    if (fields) {
      fields.forEach(field => {
        result.push(field["$"]);
      });
    }
    return result;
  },
  populateConformanceStatements: function( conformanceStatements) {
    let results = [];
    if (conformanceStatements) {
      conformanceStatements.forEach(conformanceStatement => {
        let diff = {
          id: conformanceStatement.id,
          description: {
            src: { value: conformanceStatement.description },
            derived: {}
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
          name: field.name,
          position: field.position,
          type: "field",
          path: currentPath
        },
        changed: false
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

      if (configuration.valueset) {
        fieldDifferential.bindings = ValuesetService.populateSrcValuesets(
          igId,
          datatypesMap[igId][field.datatype].bindings,
          configuration,
          valuesetsMap,
          "datatype_field"
        );
      }

      results.push(fieldDifferential);
    });
    return results;
  }
};

module.exports = SegmentService;
