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

                        // //sourceLayer.outPoint = comp.workAreaDuration;

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
                        
                        // sourceLayer.transform.Scale.setValue([sizeX * zoom,sizeY * zoom]);
                        sourceLayer.transform.Scale.expression = "sizeX = 100 * " + (sizeX * zoom * 0.01) + ";" + "sizeY = 100 * " + (sizeY * zoom * 0.01) + ";[sizeX,sizeY]";

                        var deltaX = 0; 
                        if(footage.Meta.crop.x) deltaX = footage.Meta.crop.x; //meta.crop.x
                        var deltaY = 0; 
                        if(footage.Meta.crop.y) deltaY = footage.Meta.crop.y; //meta.crop.y
                        
                        var newX = comp.width * 0.5 + deltaX * comp.width;
                        var newY = comp.height * 0.5 + deltaY * comp.height;
                        
                        //이것도문제네... 일단 표현식으로 강제해놓고 포지션만지지말라고하자 답이없음 이건
                        /*다른 방안... 정 @Source에 포지션을 건들여야하면 다른 컴포지션을 한번 더 덮어쓰게끔 */
                        sourceLayer.transform.Position.expression = "["+newX+","+newY+"]";

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
        }
    }
    
    //text
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

    
    //var newFile = new File(resultPath+'\\' + 'Result.aep');
    var newFile = new File(replaceSourcePath + 'Result.aep');
    prj.save(newFile);
//    RenderTarget();
    return 0;
}

// function RenderTarget() {
//     for (var i = 1; i <= prj.numItems; i++) {
//         var item = prj.item(i);
//         if (item instanceof CompItem && item.name == '#Target') {
//             var rendeQueueItem = prj.renderQueue.items.add(item);
//             var new_data = {
//                 'Output File Info': {
//                     'Full Flat Path': resultPath + '\\' + 'Result'
//                 }
//             };
//             rendeQueueItem.outputModule(1).setSettings(new_data);
//             rendeQueueItem.outputModule(1).applyTemplate("h264");
//             prj.renderQueue.render();
//             break;
//         }
//     }
// }

// function imageSizeToCompSize(myComp, myLayer){
//     var myRect = myLayer.sourceRectAtTime(0,false);
//     var myScale = myLayer.property("Scale").value;
//     var myNewScale = myScale*Math.min(myComp.width/myRect.width,myComp.height/myRect.height); // [myScale[0]myComp.width/myRect.width,myScale[1]myComp.height/myRect.height];
//     myLayer.property("Scale").setValue(myNewScale);
//   }