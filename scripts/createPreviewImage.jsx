/// <reference types='types-for-adobe/AfterEffects/2018'/>\nalert(String(app));'> 
function includeScript(filename) {
    var scriptRootPath = '${ScriptRootPath}'
    var scriptFile = File(scriptRootPath + '/' + filename);
    return '#include ' + scriptFile.fullName;
}

eval(includeScript('json2.js'))
eval(includeScript('slideHelper.js'))

var resultPath = '${ResultPath}';
var gettyImagesPath = '${gettyImagesPath}\\'
var replaceSourcePath = '${ReplaceSourcePath}\\';
var projectPath = '${ProjectPath}';

var projFile = new File(projectPath);
var prj = app.open(projFile);
prj.expressionEngine = 'javascript-1.0';

ParseMaterial();

function ParseMaterial() {
    var material = ${Material};
    var editableData = ${EditableData};
    var duration = 0;

    var footageMaterialMap = {};
    var textMaterialMap = {};

    var changedFontMap = {};

    for(var i = 0; i<material.Footage.length; i++) {
        var footage = material.Footage[i];
        footageMaterialMap[footage.Composition] = footage;
    }
    
    for(var i = 0; i<material.Text.length; i++) {
        var text = material.Text[i];
        textMaterialMap[text.Composition] = text;
    }

    var targetFind = false
    for (var i = 1; i <= prj.numItems; i++) {
        var comp = prj.item(i);
        if (comp instanceof CompItem && comp.layer && comp.numLayers) {
            var compName = comp.name.toLowerCase();
            if (compName.indexOf('#target') != -1 && !targetFind) {
                targetFind = true
                SlideCopyAndStretch(comp, editableData, material);

                duration = comp.workAreaDuration - comp.workAreaStart;

                for (var j = 1; j <= comp.numLayers; j++) {
                    var layer = comp.layer(j);
                    if (layer != null && layer instanceof AVLayer) {
                        var name = layer.name.toLowerCase();
                        layer.audioEnabled = name.indexOf('#cut') !== -1;
                    }
                }
            }
            else if (compName.indexOf('#cut') != -1) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    var layer = comp.layer(j);
                    if (layer != null && layer instanceof AVLayer) {
                        var name = layer.name.toLowerCase();
                        if (name.indexOf('#av') !== -1) layer.audioEnabled = true;
                    }
                }
            }
        }
    }

    var footageItemObjectMap = {}
    for (var i = 1; i <= prj.numItems; i++) {
        if (prj.item(i) instanceof CompItem && footageMaterialMap.hasOwnProperty(prj.items[i].name)) {
            var footage = footageMaterialMap[prj.items[i].name];
            var comp = prj.item(i);
            var sourceLayer = comp.layer('@Source');
            if (sourceLayer && sourceLayer.source) {
                var footagePath
                if (footage.Meta != undefined && footage.Meta.source != undefined && footage.Meta.source == 'gettyimages') {
                    footagePath = gettyImagesPath + footage.Replace;
                }
                else {
                    footagePath = replaceSourcePath + footage.Replace;
                }

                if (!footageItemObjectMap[footagePath]) {
                    footageItemObjectMap[footagePath] = prj.importFile(new ImportOptions(new File(footagePath)))
                }
                sourceLayer.replaceSource(footageItemObjectMap[footagePath], false)

                if (footage.Meta != undefined) //비디오인 경우
                {
                    var zoom = 1;
                    if (footage.Meta.crop.zoom) {
                        zoom = footage.Meta.crop.zoom; //meta.crop.zoom
                    }

                    var startTime = 0;
                    if (footage.Meta.from) {
                        startTime = footage.Meta.from;//meta.from
                    }

                    sourceLayer.audioEnabled = footage.Meta.enableAudio ? true : false;

                    sourceLayer.startTime = 0;
                    sourceLayer.inPoint = 0;

                    sourceLayer.inPoint = startTime;
                    sourceLayer.startTime = -startTime;

                    // //sourceLayer.outPoint = comp.workAreaDuration;

                    var sizeX = 100 * comp.width / sourceLayer.width;
                    var sizeY = 100 * comp.height / sourceLayer.height;

                    if (sizeX > sizeY) {
                        sizeY = sizeX;
                    }
                    else {
                        sizeX = sizeY;
                    }

                    // sourceLayer.transform.Scale.setValue([sizeX * zoom,sizeY * zoom]);
                    sourceLayer.transform.Scale.expression = "sizeX = 100 * " + (sizeX * zoom * 0.01) + ";" + "sizeY = 100 * " + (sizeY * zoom * 0.01) + ";[sizeX,sizeY]";

                    var deltaX = 0;
                    if (footage.Meta.crop.x) deltaX = footage.Meta.crop.x; //meta.crop.x
                    var deltaY = 0;
                    if (footage.Meta.crop.y) deltaY = footage.Meta.crop.y; //meta.crop.y

                    var newX = comp.width * 0.5 + deltaX * comp.width;
                    var newY = comp.height * 0.5 + deltaY * comp.height;

                    //이것도문제네... 일단 표현식으로 강제해놓고 포지션만지지말라고하자 답이없음 이건
                    /*다른 방안... 정 @Source에 포지션을 건들여야하면 다른 컴포지션을 한번 더 덮어쓰게끔 */
                    sourceLayer.transform.Position.expression = "[" + newX + "," + newY + "]";

                }
                else //이미지인 경우
                {
                    sourceLayer.transform.scale.expression = "sizeX = 100*thisComp.width/thisLayer.width;sizeY = 100*thisComp.height/thisLayer.height;if(sizeX < sizeY){  sizeY=sizeX; } else {  sizeX=sizeY; }[sizeX,sizeY]";
                    sourceLayer.parent = null; //부모 스케일 영향을 받지 않기위해
                }

            }
            else {
                writeLn('@Source is Null');
            }
        }
        else if (prj.item(i) instanceof CompItem && textMaterialMap.hasOwnProperty(prj.item(i).name)) {
            var text = textMaterialMap[prj.item(i).name];
            var comp = prj.item(i);
            // var textLayer = comp.layer('@Source');

            for (var j = 1; j <= comp.numLayers; j++) {
                var textLayer = comp.layer(j);
                if (textLayer != null && textLayer instanceof TextLayer) {
                    if (textLayer.name === '@Source') {
                        var orgValue = textLayer.text.sourceText.value;
                        var orgWidth = comp.width;//textLayer.sourceRectAtTime(0,false).width;    
                        orgValue.text = text.Context;
                        textLayer.text.sourceText.setValue(orgValue);
                        var decressDelta = 0.5;

                        if (textLayer.canSetCollapseTransformation) {
                            textLayer.collapseTransformation = true
                        }
                        // else {
                        //     //2019/01/06 텍스트 Fitting
                        //     var curWidth = textLayer.sourceRectAtTime(0, false).width;
                        //     while (orgWidth < curWidth) {
                        //         var textProp = textLayer.property("Source Text");
                        //         var textDocument = textProp.value;
                        //         if (textDocument.fontSize - decressDelta < decressDelta) break;

                        //         textDocument.fontSize -= decressDelta;
                        //         textProp.setValue(textDocument);
                        //         curWidth = textLayer.sourceRectAtTime(0, false).width;
                        //     }
                        // }
                    }

                    if (text.Font || text.option) {
                        changedFontMap[prj.item(i).name] = true;
                        var textProp = textLayer.property("Source Text");
                        var textDocument = textProp.value;

                        if (text.Font) {
                            textDocument.font = text.Font;
                        }
                        if (text.option) {
                            if (text.option.Font) {
                                textDocument.font = text.option.Font.postscriptName;
                            }
                            if (text.option.fontSize) {
                                textDocument.fontSize = textDocument.fontSize + (textDocument.fontSize * (text.option.fontSize / 100));
                            }
                            if (textDocument.applyFill && text.option.fillColor) {
                                text.option.fillColor = text.option.fillColor.replace('#', '');

                                var r = parseInt(text.option.fillColor.substr(0, 2), 16) / 255;
                                var g = parseInt(text.option.fillColor.substr(2, 2), 16) / 255;
                                var b = parseInt(text.option.fillColor.substr(4, 2), 16) / 255;

                                textDocument.fillColor = [r, g, b];
                            }
                            if (textDocument.applyStroke && text.option.strokeColor) {
                                text.option.strokeColor = text.option.strokeColor.replace('#', '');

                                var r = parseInt(text.option.strokeColor.substr(0, 2), 16) / 255;
                                var g = parseInt(text.option.strokeColor.substr(2, 2), 16) / 255;
                                var b = parseInt(text.option.strokeColor.substr(4, 2), 16) / 255;

                                textDocument.strokeColor = [r, g, b];
                            }
                        }

                        textProp.setValue(textDocument);
                    }
                }
            }
        }
    }

    var changedFontCount = 0;
    for (var changedFont in changedFontMap) {
        changedFontCount++;
    }

    if (changedFontCount > 0) {
        for (var i = 1; i <= prj.numItems; i++) {
            if (prj.item(i) instanceof CompItem) {
                var comp = prj.item(i);
    
                for (var k = 1; k <= comp.numLayers; k++) {
                    var textLayer = comp.layer(k);
                    if (textLayer != null && textLayer instanceof TextLayer) {
                        if (textMaterialMap.hasOwnProperty(comp.name) && textLayer.name === '@Source') continue;
                        var textProp = textLayer.property("Source Text");
                        var expression = textProp.expression;
                        if (typeof expression === 'string') {
                            var start = expression.indexOf('#TEXT');
                            var end = expression.indexOf('").layer("@Source").text.sourceText');
                            var compName = expression.substring(start, end);
                            var targetExpression = 'comp("' + compName + '").layer("@Source").text.sourceText';
                            if (changedFontMap.hasOwnProperty(compName) && expression.indexOf(targetExpression) !== -1) {
                                var textDocument = textProp.value;

                                textProp.expression = 'sourceText = comp("' + compName + '").layer("@Source").text.sourceText; style = comp("' + compName + '").layer("@Source").text.sourceText.style;';
                                textProp.setValue(textDocument);
                            }
                        }
                    }
                }
            }
        }
    }
    
    var newFile = new File(replaceSourcePath + 'Result.aep');
    prj.save(newFile);

    var newJsonFile = new File(replaceSourcePath + 'Result.json');
    writeFile(newJsonFile, JSON.stringify({ duration: duration }))

    prj = app.open(newFile);
    CreatePreview(prj);
}

function writeFile(fileObj, fileContent, encoding) {
    encoding = encoding || 'utf-8';
    fileObj = (fileObj instanceof File) ? fileObj : new File(fileObj);

    var parentFolder = fileObj.parent;
    if (!parentFolder.exists && !parentFolder.create())
        throw new Error('Cannot create file in path ' + fileObj.fsName);


    fileObj.encoding = encoding;
    fileObj.open('w');
    fileObj.write(fileContent);
    fileObj.close();


    return fileObj;
}

function CreatePreview(proj)
{
    var items = app.project.items;
    //ClearRenderQueue();

    for(var i=1; i <= items.length; i++)
    {
        var itemName = items[i].name.toLowerCase();
        if(itemName.indexOf('#cut') != -1 && items[i].layers)
        {
            // for(var j = 1; j < items[i].layers.length; j++)
            // {
       
            //     if(items[i].layers[j] instanceof CameraLayer)
            //     {
            //         items[i].layers[j].enabled = false;
            //     }
            // }
            var markers = null; //items[i].layers.byName('@PREVIEW');
            
            for(var j = 1; j <= items[i].layers.length; j++)
            {
                if(items[i].layers[j].name.toLowerCase() == '@preview' && items[i].layers[j].enabled && !items[i].layers[j].shy)
                {
                    markers = items[i].layers[j]
                }
            }
            
            if(markers)
            {
                var render = proj.renderQueue.items.add(items[i]);
                var renderSetting = render.getSettings(GetSettingsFormat.STRING_SETTABLE)

                delete renderSetting['Time Span'];
                renderSetting['Time Span Start'] = markers.inPoint;
                renderSetting['Time Span End'] = markers.inPoint;
                renderSetting['Time Span Duration'] = '0.03';

                render.setSettings(renderSetting);
                
                render.outputModule(1).applyTemplate('PreviewOM');
                var omSetting = render.outputModule(1).getSettings(GetSettingsFormat.STRING_SETTABLE);
                
                omSetting['Output File Info'] = 
                {
                    'Base Path': resultPath,
                    'Subfolder Path':'',
                    'File Name': items[i].name.toLowerCase().replace('#cut', 'Cut') + '.jpg'
                };
                render.outputModule(1).setSettings(omSetting);
            }
        }
    }

    proj.renderQueue.render();
}