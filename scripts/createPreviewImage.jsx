/// <reference types='types-for-adobe/AfterEffects/2018'/>\nalert(String(app));'> 
var scriptFile = File('${Json2Path}');
var script = '#include' + scriptFile.fullName;
eval(script);
clearOutput();

var resultPath = '${ResultPath}';
var gettyImagesPath = '${gettyImagesPath}\\'
var replaceSourcePath = '${ReplaceSourcePath}\\';
var projectPath = '${ProjectPath}';

var projFile = new File(projectPath);
var prj = app.open(projFile);

ParseMaterial();
CreatePreview();

function ParseMaterial() {
    var material = ${Material};

    //footage
    for(var j = 0; j<material.Footage.length; j++)
    {
        var footage = material.Footage[j];
        for (var i = 1; i <= prj.numItems; i++) {
            if (prj.item(i) instanceof CompItem && prj.items[i].name === footage.Composition) {
                var comp = prj.item(i);
                var sourceLayer = comp.layer('@Source');
                if(sourceLayer)
                {
                    var footageItem = sourceLayer.source;
                    if (footageItem) {
                        if (footage.Meta != undefined && footage.Meta.source != undefined && footage.Meta.source == 'gettyimages') {
                            footageItem.replace(new File(gettyImagesPath + footage.Replace));
                        }
                        else {
                            footageItem.replace(new File(replaceSourcePath + footage.Replace));
                        }
                    }

                    if(footage.Meta != undefined) //비디오인 경우
                    {
                        var zoom = 1;
                        if(footage.Meta.crop.zoom)
                        {
                            zoom = footage.Meta.crop.zoom; //meta.crop.zoom
                        }
                        var startTime = 0;
                        if(footage.Meta.from)
                        {
                            startTime = footage.Meta.from;//meta.from
                        }

                        sourceLayer.startTime = 0;
                        sourceLayer.inPoint = 0;

                        sourceLayer.inPoint = startTime;
                        sourceLayer.startTime = -startTime;

                        //sourceLayer.outPoint = comp.workAreaDuration;

                        var sizeX = 100*comp.width/sourceLayer.width;
                        var sizeY = 100*comp.height/sourceLayer.height;

                        if(sizeX > sizeY)
                        {
                            sizeY=sizeX;
                        }
                        else 
                        {
                            sizeX=sizeY;
                        }
                        
                        sourceLayer.transform.Scale.setValue([sizeX * zoom,sizeY * zoom]);

                        var deltaX = 0; 
                        if(footage.Meta.crop.x) deltaX = footage.Meta.crop.x; //meta.crop.x
                        var deltaY = 0; 
                        if(footage.Meta.crop.y) deltaY = footage.Meta.crop.y; //meta.crop.y
                        
                        var newX = comp.width * 0.5 + deltaX * comp.width;
                        var newY = comp.height * 0.5 + deltaY * comp.height;
                        
                        sourceLayer.transform.position.setValue([newX,newY]);
                    }
                    else
                    {
                        sourceLayer.transform.scale.expression = "sizeX = 100*thisComp.width/thisLayer.width;sizeY = 100*thisComp.height/thisLayer.height;if(sizeX < sizeY){  sizeY=sizeX; } else {  sizeX=sizeY; }[sizeX,sizeY]";
                        sourceLayer.parent = null; //부모 스케일 영향을 받지 않기위해
                    }
                }
                else {
                    writeLn('@Source is Null');
                }
            }
        }
    }
    
    for(var j = 0; j<material.Text.length; j++)
    {
        var text =  material.Text[j];
        for (var i = 1; i <= prj.numItems; i++) {
            if (prj.item(i) instanceof CompItem && prj.item(i).name === text.Composition) {
                var comp = prj.item(i);
                var textLayer = comp.layer('@Source');
                if (textLayer != null) {

                    var orgValue = textLayer.text.sourceText.value;
                    var orgWidth = comp.width;//textLayer.sourceRectAtTime(0,false).width;    
                    orgValue.text = text.Context;
                    textLayer.text.sourceText.setValue(orgValue);
                    var decressDelta = 0.5;

                    //2019/01/06 텍스트 Fitting
                    var curWidth = textLayer.sourceRectAtTime(0,false).width;
                    while(orgWidth < curWidth)
                    {
                        var textProp = textLayer.property("Source Text");
                        var textDocument = textProp.value;
                        if(textDocument.fontSize - decressDelta <decressDelta) break;
                        
                        textDocument.fontSize -= decressDelta;
                        textProp.setValue(textDocument);
                        curWidth = textLayer.sourceRectAtTime(0,false).width;
                    }
                }
            }
        }
    }

    // var newFile = new File(replaceSourcePath + 'Result.aep');
    // prj.save(newFile);
    // //RenderTarget();
    return 0;
}
function CreatePreview()
{
    var proj = app.project;
    var index = 1;
    var items = app.project.items;
    //ClearRenderQueue();

    for(var i=1; i <= items.length; i++)
    {
        var itemName = items[i].name.toLowerCase();
        if(itemName.indexOf('#cut') != -1)
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
                    'File Name':'Cut' + index + '.jpg'
                };
                render.outputModule(1).setSettings(omSetting);
                index++;
            }
        }
    }

    proj.renderQueue.render();
}