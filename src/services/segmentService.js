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
  extractSegment(segment) {
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
        segment.Binding && segment.Binding[0].StructureElementBindings &&
        segment.Binding[0].StructureElementBindings[0] &&
        segment.Binding[0].StructureElementBindings[0].StructureElementBinding
      ) {
        result.bindings = this.extractBindings(
          segment.Binding[0].StructureElementBindings[0].StructureElementBinding
        );
      }
    }
    return result;
  },
  extractFields(fields) {
    let result = [];
    if (fields) {
      fields.forEach(field => {
        result.push(field["$"]);
      });
    }
    return result;
  },
  extractBindings(bindings) {
    let result = [];
    if (bindings) {
      bindings.forEach(binding => {
        if (binding.ValuesetBinding && binding.ValuesetBinding[0]) {
          const details = binding.ValuesetBinding[0]["$"];
          const b = {
            strength: details.strength,
            bindingLocation: details.bindingLocation,
            locations: details.locations,
            position: binding["$"].Position1,
            LocationInfoType: binding["$"].LocationInfoType,
            valuesets: this.extractValuesetsFromName(details.name),
            versions: this.extractValuesetsFromName(details.version)
          };
          result.push(b);
        }
      });
    }
    return result;
  },
  extractValuesetsFromName(name) {
    let valuesets = [];
    if (name) {
      valuesets = name.split(",");
    }
    return valuesets;
  }
};

module.exports = SegmentService;
