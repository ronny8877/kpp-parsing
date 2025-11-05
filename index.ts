import ExifReader from "exifreader";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

// Create output directories
const outputXmlDir = "./output/xml";
const outputJsonDir = "./output/json";
const outputBrushesDir = "./output/brushes";
const outputPatternsDir = "./output/patterns";

for (const dir of [
	outputXmlDir,
	outputJsonDir,
	outputBrushesDir,
	outputPatternsDir,
]) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

// Get all .kpp files from assets/kpp directory
const kppDir = "./assets/kpp";
const files = fs.readdirSync(kppDir).filter((file) => file.endsWith(".kpp"));

// Configure XML parser
const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "",
	textNodeName: "text",
	parseAttributeValue: true,
	parseTagValue: true,
	trimValues: true,
	cdataPropName: "cdata",
});

// Function to parse brush definition XML
function parseBrushDefinition(brushDefXml: string) {
	try {
		const parsed = xmlParser.parse(brushDefXml);
		const brush = parsed.Brush;

		if (!brush) return null;

		const result: any = {
			type: brush.type || null,
			spacing: brush.spacing || null,
			angle: brush.angle || null,
			scale: brush.scale || null,
			randomness: brush.randomness || null,
			density: brush.density || null,
			filename: brush.filename || null,
		};

		// Parse MaskGenerator if present (for auto brushes)
		if (brush.MaskGenerator) {
			result.maskGenerator = {
				type: brush.MaskGenerator.type || null,
				diameter: brush.MaskGenerator.diameter || null,
				ratio: brush.MaskGenerator.ratio || null,
				hfade: brush.MaskGenerator.hfade || null,
				vfade: brush.MaskGenerator.vfade || null,
				spikes: brush.MaskGenerator.spikes || null,
			};
		}

		return result;
	} catch (error) {
		console.error("Error parsing brush definition:", error);
		return null;
	}
}

// Function to extract brush parameters
function extractBrushParameters(parameters: Record<string, any>) {
	const brushData: any = {};

	// Parse brush definition XML - this is our primary source
	if (parameters.brush_definition) {
		const brushDef = parseBrushDefinition(parameters.brush_definition);
		if (brushDef) {
			// Extract all numeric values from brush definition
			if (brushDef.spacing !== null && brushDef.spacing !== undefined) {
				brushData.spacing = brushDef.spacing;
			}
			if (brushDef.angle !== null && brushDef.angle !== undefined) {
				brushData.angle = brushDef.angle;
			}
			if (brushDef.scale !== null && brushDef.scale !== undefined) {
				brushData.scale = brushDef.scale;
			}
			if (brushDef.randomness !== null && brushDef.randomness !== undefined) {
				brushData.randomness = brushDef.randomness;
			}
			if (brushDef.density !== null && brushDef.density !== undefined) {
				brushData.density = brushDef.density;
			}
			if (brushDef.filename) {
				brushData.filename = brushDef.filename;
			}
			if (brushDef.type) {
				brushData.type = brushDef.type;
			}

			// Extract from MaskGenerator if present
			if (brushDef.maskGenerator) {
				if (
					brushDef.maskGenerator.diameter !== null &&
					brushDef.maskGenerator.diameter !== undefined
				) {
					brushData.size = brushDef.maskGenerator.diameter;
				}
				if (
					brushDef.maskGenerator.ratio !== null &&
					brushDef.maskGenerator.ratio !== undefined
				) {
					brushData.roundness = brushDef.maskGenerator.ratio;
				}
				if (
					brushDef.maskGenerator.hfade !== null &&
					brushDef.maskGenerator.hfade !== undefined
				) {
					brushData.hfade = brushDef.maskGenerator.hfade;
				}
				if (
					brushDef.maskGenerator.vfade !== null &&
					brushDef.maskGenerator.vfade !== undefined
				) {
					brushData.vfade = brushDef.maskGenerator.vfade;
				}
				if (
					brushDef.maskGenerator.spikes !== null &&
					brushDef.maskGenerator.spikes !== undefined
				) {
					brushData.spikes = brushDef.maskGenerator.spikes;
				}
			}
		}
	}

	// Extract numeric dynamic properties
	if (
		parameters.OpacityValue !== null &&
		parameters.OpacityValue !== undefined
	) {
		brushData.opacity = parameters.OpacityValue;
	}
	if (
		parameters.ScatterValue !== null &&
		parameters.ScatterValue !== undefined
	) {
		brushData.scatter = parameters.ScatterValue;
	}
	if (parameters.FlowValue !== null && parameters.FlowValue !== undefined) {
		brushData.flow = parameters.FlowValue;
	}

	// Extract pressure/tilt/rotation sensor curves (numeric values only)
	const sensorMappings = {
		OpacitySensor: "pressureOpacity",
		SizeSensor: "pressureSize",
		RotationSensor: "pressureRotation",
		ScatterSensor: "pressureScatter",
		FlowSensor: "pressureFlow",
	};

	for (const [paramKey, outputKey] of Object.entries(sensorMappings)) {
		if (parameters[paramKey] && parameters[paramKey].params) {
			const sensor = parameters[paramKey].params;
			// Only include if there's a numeric curve value
			if (sensor.curve !== null && sensor.curve !== undefined) {
				brushData[outputKey] = sensor.curve;
			}
		}
	}

	// Texture/Pattern information - numeric values only
	if (parameters["Texture/Pattern/Pattern"]) {
		if (
			parameters["Texture/Pattern/Scale"] !== null &&
			parameters["Texture/Pattern/Scale"] !== undefined
		) {
			brushData.patternScale = parameters["Texture/Pattern/Scale"];
		}
		if (
			parameters["Texture/Pattern/Strength"] !== null &&
			parameters["Texture/Pattern/Strength"] !== undefined
		) {
			brushData.patternStrength = parseFloat(
				parameters["Texture/Pattern/Strength"],
			);
		}
	}

	return brushData;
}

// Function to save pattern as bitmap
function savePatternBitmap(base64Data: string, outputPath: string) {
	try {
		// Remove data URL prefix if present
		const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Clean, "base64");
		fs.writeFileSync(outputPath, buffer);
		return true;
	} catch (error) {
		console.error("Error saving pattern bitmap:", error);
		return false;
	}
}

// Function to write data to disk
const writeToDisk = ({
	data,
	outputPath,
	fileName,
}: {
	data: any;
	outputPath: string;
	fileName: string;
}) => {
	// Check if the location exists, create if not
	if (!fs.existsSync(outputPath)) {
		fs.mkdirSync(outputPath, { recursive: true });
	}

	const fullPath = path.join(outputPath, fileName);
	fs.writeFileSync(fullPath, data);
};

// Process each .kpp file
console.log(`Found ${files.length} .kpp files to process\n`);

for (const file of files) {
	const filePath = path.join(kppDir, file);
	const baseName = path.basename(file, ".kpp");

	console.log(`Processing: ${file}`);

	try {
		// Read and parse the .kpp file
		const fileBuffer = fs.readFileSync(filePath);
		const tags = ExifReader.load(fileBuffer);

		if (!tags.preset || !tags.preset.value) {
			console.log(` No preset data found in ${file}\n`);
			continue;
		}

		// Parse the main preset XML
		let jsonObj = xmlParser.parse(tags.preset.value);

		const transformedObj = {
			name: jsonObj.Preset?.name || "",
			paintopid: jsonObj.Preset?.paintopid || "",
			parameters: {} as Record<string, any>,
		};

		// Convert param array to a keyed object
		if (jsonObj.Preset?.param) {
			const params = Array.isArray(jsonObj.Preset.param)
				? jsonObj.Preset.param
				: [jsonObj.Preset.param];

			for (const param of params) {
				if (param.name) {
					transformedObj.parameters[param.name] =
						param.value || param.text || param.cdata || "";
				}
			}
		}

		// Save the raw XML file
		writeToDisk({
			data: tags.preset.value,
			outputPath: outputXmlDir,
			fileName: `${baseName}.xml`,
		});
		console.log(`  ✓ Saved XML to output/xml/${baseName}.xml`);

		// Save the full parsed JSON
		writeToDisk({
			data: JSON.stringify(transformedObj, null, 2),
			outputPath: outputJsonDir,
			fileName: `${baseName}.json`,
		});
		console.log(`  ✓ Saved full JSON to output/json/${baseName}.json`);

		// Extract brush data
		const brushData = extractBrushParameters(transformedObj.parameters);

		// Save pattern bitmap if present
		if (transformedObj.parameters["Texture/Pattern/Pattern"]) {
			const patternPath = path.join(
				outputPatternsDir,
				`${baseName}_pattern.png`,
			);
			const saved = savePatternBitmap(
				transformedObj.parameters["Texture/Pattern/Pattern"],
				patternPath,
			);
			if (saved) {
				brushData.patternFile = `${baseName}_pattern.png`;
				console.log(
					`  ✓ Saved pattern to output/patterns/${baseName}_pattern.png`,
				);
			}
		}

		// Save brush data JSON
		const brushOutputPath = path.join(
			outputBrushesDir,
			`${baseName}_brush.json`,
		);
		fs.writeFileSync(
			brushOutputPath,
			JSON.stringify(
				{
					name: transformedObj.name,
					paintopid: transformedObj.paintopid,
					brush: brushData,
				},
				null,
				2,
			),
		);

		console.log(
			`  ✓ Saved brush data to output/brushes/${baseName}_brush.json\n`,
		);
	} catch (error) {
		console.error(
			` Error processing ${file}:`,
			error instanceof Error ? error.message : String(error),
			"\n",
		);
	}
}

console.log("Processing complete!");
