const fs = require("fs");
const xml2js = require("xml2js");
const parser = new xml2js.Parser({
  explicitChildren: true,
  preserveChildrenOrder: true
});
const CalculationService = require("./diff/calculationService");
const ValidationCalculationService = require("./validation/calculationService");

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
  },
  calculateVerificationDifferential: function(req, res) {
    const { source, ...files } = req.files;
    if (!req.body.configuration) {
      return res.status(500).send({ message: "Configuration is required" });
    }
    if (!req.body.srcProfile) {
      return res.status(500).send({ message: "Source profile is required" });
    }
    if (!req.body.derivedProfile) {
      return res.status(500).send({ message: "Derived profile is required" });
    }
    const configuration = JSON.parse(req.body.configuration);
    const srcProfileId = req.body.srcProfile;
    const derivedProfileId = req.body.derivedProfile;

    const sourceXml = source.data.toString("utf8");
    let sourceProfile;
    let derivedIgs = [];
    let self = this;
    parser.parseString(sourceXml, function(err, result) {
      if (
        result &&
        result.ConformanceProfile &&
        result.ConformanceProfile.Messages &&
        result.ConformanceProfile.Messages[0] &&
        result.ConformanceProfile.Messages[0].Message
      ) {
        sourceProfile = {
          ig: result.ConformanceProfile.MetaData[0]["$"].Name,
          id: srcProfileId
        };
        const selectedProfile = result.ConformanceProfile.Messages[0].Message.find(
          m => m["$"].ID === srcProfileId
        );
        if (selectedProfile) {
          sourceProfile.profile = selectedProfile;
          self.populatePosition(sourceProfile.profile);
        } else {
          return res
            .status(500)
            .send({ message: "Profile selected not found" });
        }

        if (
          result.ConformanceProfile.Segments &&
          result.ConformanceProfile.Segments[0]
        ) {
          sourceProfile.segments =
            result.ConformanceProfile.Segments[0].Segment;
          sourceProfile.segments.forEach(seg => {
            self.populatePosition(seg);
          });
        }
        if (
          result.ConformanceProfile.Datatypes &&
          result.ConformanceProfile.Datatypes[0]
        ) {
          sourceProfile.datatypes =
            result.ConformanceProfile.Datatypes[0].Datatype;
          sourceProfile.datatypes.forEach(dt => {
            self.populatePosition(dt);
          });
        }
        // for (
        //   let index = 0;
        //   index < result.Document.Section[0].Section.length;
        //   index++
        // ) {
        //   const section = result.Document.Section[0].Section[index];
        //   if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
        //     sourceProfile.profiles = section.Section;
        //   }

        //   if (section["$"].type === "SEGMENTREGISTRY") {
        //     sourceProfile.segments = section.Section;
        //   }
        //   if (section["$"].type === "DATATYPEREGISTRY") {
        //     sourceProfile.datatypes = section.Section;
        //   }
        //   if (section["$"].type === "VALUESETREGISTRY") {
        //     sourceProfile.valuesets = section.Section;
        //   }
        // }
      }
    });

    for (const key in files) {
      if (files.hasOwnProperty(key)) {
        const file = files[key];
        const fileXml = file.data.toString("utf8");

        parser.parseString(fileXml, function(err, result) {
          if (
            result &&
            result.ConformanceProfile &&
            result.ConformanceProfile.Messages &&
            result.ConformanceProfile.Messages[0] &&
            result.ConformanceProfile.Messages[0].Message
          ) {
            let derivedIg = {
              ig: result.ConformanceProfile.MetaData[0]["$"].Name,
              id: derivedProfileId
            };
            const selectedProfile = result.ConformanceProfile.Messages[0].Message.find(
              m => m["$"].ID === derivedProfileId
            );
            if (selectedProfile) {
              derivedIg.profile = selectedProfile;
              self.populatePosition(derivedIg.profile);

             
            } else {
              return res
                .status(500)
                .send({ message: "Profile selected not found" });
            }
            if (
              result.ConformanceProfile.Segments &&
              result.ConformanceProfile.Segments[0]
            ) {
              derivedIg.segments =
                result.ConformanceProfile.Segments[0].Segment;
                derivedIg.segments.forEach(seg => {
                self.populatePosition(seg);
              });
            }
            if (
              result.ConformanceProfile.Datatypes &&
              result.ConformanceProfile.Datatypes[0]
            ) {
              derivedIg.datatypes =
                result.ConformanceProfile.Datatypes[0].Datatype;
                derivedIg.datatypes.forEach(dt => {
                self.populatePosition(dt);
              });
            }
            // for (
            //   let index = 0;
            //   index < result.Document.Section[0].Section.length;
            //   index++
            // ) {
            //   const section = result.Document.Section[0].Section[index];

            //   if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
            //     derivedIg.profiles = section.Section;
            //   }
            //   if (section["$"].type === "SEGMENTREGISTRY") {
            //     derivedIg.segments = section.Section;
            //   }
            //   if (section["$"].type === "DATATYPEREGISTRY") {
            //     derivedIg.datatypes = section.Section;
            //   }
            //   if (section["$"].type === "VALUESETREGISTRY") {
            //     derivedIg.valuesets = section.Section;
            //   }
            // }
            derivedIgs.push(derivedIg);
          }
        });
      }
    }
    const result = ValidationCalculationService.calculate(
      sourceProfile,
      derivedIgs,
      configuration
    );
    res.status(200).send({ success: true, data: result });
  },

  populatePosition: function(profile) {
    let position = 1;
    if (profile["$$"]) {
      profile["$$"].forEach(element => {
        if (element["#name"] === "Segment") {
          let seg = profile.Segment.find(s => {
            return s["$"].Ref === element["$"].Ref;
          });
          seg["$"].position = position.toString();
        }
        if (element["#name"] === "Group") {
          let grp = profile.Group.find(g => {
            return g["$"].ID === element["$"].ID;
          });
          grp["$"].position = position.toString();
          this.populatePosition(grp);
        }
        if (element["#name"] === "Field") {
          let seg = profile.Field.find(s => {
            return s["$"].Name === element["$"].Name;
          });
          seg["$"].position = position.toString();
        }
        if (element["#name"] === "Component") {
          let seg = profile.Component.find(s => {
            return s["$"].Name === element["$"].Name;
          });
          seg["$"].position = position.toString();
        }
        position++;
      });
    }
  }
};

module.exports = DifferentialService;
