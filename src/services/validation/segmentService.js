const DatatypeService = require("./datatypeService");
const ValuesetService = require("./valuesetService");
const ComparisonService = require("../comparisonService");

let SegmentService = {
  populateSegmentsMap: function(segmentsMap, igId, segments) {
    console.log(igId)
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
        children: this.extractFields(segment.Field)
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
        result.push({
          name: field['$'].Name,
          usage: field['$'].Usage,
          datatype: field['$'].Datatype,
          confLength: field['$'].ConfLength,
          minLength: field['$'].MinLength,
          maxLength: field['$'].MaxLength,
          min: field['$'].Min,
          max: field['$'].Max,
          position: field['$'].position,
          binding: field['$'].Binding,
          bindingStrength: field['$'].BindingStrength,

        });
      });
    }
    return result;
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
