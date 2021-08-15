const fs = require("fs");
const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const CalculationService = require("./calculationService");

let DifferentialService = {
  calculateDifferential: function(req, res) {
    const { source, ...files } = req.files;
    if (!req.body.configuration) {
      return res.status(500).send({ message: "Configuration is required" });
    }
    const configuration = JSON.parse(req.body.configuration);
    const sourceXml = source.data.toString("utf8");
    let sourceProfile;
    let derivedIgs = [];
    parser.parseString(sourceXml, function(err, result) {
      if (result && result.Document && result.Document.Section) {
        sourceProfile = {
          ig: result.Document.Metadata[0]["$"].title,
          id: result.Document["$"].id
        };
        for (
          let index = 0;
          index < result.Document.Section[0].Section.length;
          index++
        ) {
          const section = result.Document.Section[0].Section[index];
          if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
            sourceProfile.profiles = section.Section;
          }

          if (section["$"].type === "SEGMENTREGISTRY") {
            sourceProfile.segments = section.Section;
          }
          if (section["$"].type === "DATATYPEREGISTRY") {
            sourceProfile.datatypes = section.Section;
          }
          if (section["$"].type === "VALUESETREGISTRY") {
            sourceProfile.valuesets = section.Section;
          }
        }
      }
    });

    for (const key in files) {
      if (files.hasOwnProperty(key)) {
        const file = files[key];
        const fileXml = file.data.toString("utf8");

        parser.parseString(fileXml, function(err, result) {
          if (result && result.Document && result.Document.Section) {
            let derivedIg = {
              ig: result.Document.Metadata[0]["$"].title,
              id: result.Document["$"].id
            };
            for (
              let index = 0;
              index < result.Document.Section[0].Section.length;
              index++
            ) {
              const section = result.Document.Section[0].Section[index];

              if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
                derivedIg.profiles = section.Section;
              }
              if (section["$"].type === "SEGMENTREGISTRY") {
                derivedIg.segments = section.Section;
              }
              if (section["$"].type === "DATATYPEREGISTRY") {
                derivedIg.datatypes = section.Section;
              }
              if (section["$"].type === "VALUESETREGISTRY") {
                derivedIg.valuesets = section.Section;
              }
            }
            derivedIgs.push(derivedIg);

          }
        });
      }
    }
    const result = CalculationService.calculate(
      sourceProfile,
      derivedIgs,
      configuration
    );
    res.status(200).send({ success: true, data: result });

  }
};

module.exports = DifferentialService;
