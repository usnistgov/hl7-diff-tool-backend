const DatatypeService = require("./datatypeService");
const ValuesetService = require("./valuesetService");

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
  },
};

module.exports = SegmentService;
