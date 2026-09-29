const PET_SIZES={small:130,medium:168,large:196};
function petWindowSize(size){return (PET_SIZES[size]||168)+16;}
function clamp(value,min,max){return Math.max(min,Math.min(value,Math.max(min,max)));}
function clampPet(position,size,area){return{x:Math.round(clamp(position.x,area.x,area.x+area.width-size)),y:Math.round(clamp(position.y,area.y,area.y+area.height-size))};}
function positionBubble(pet,bubble,area){
 const gap=8,margin=6,width=Math.min(bubble.width,area.width-margin*2),height=Math.min(bubble.height,area.height-margin*2);
 let x=pet.x+pet.width/2-width/2,y=pet.y-height-gap,side='above';
 if(y<area.y+margin){y=pet.y+pet.height+gap;side='below';}
 if(y+height>area.y+area.height-margin){side=pet.x+pet.width/2<area.x+area.width/2?'right':'left';x=side==='right'?pet.x+pet.width+gap:pet.x-width-gap;y=pet.y+pet.height/2-height/2;}
 return{x:Math.round(clamp(x,area.x+margin,area.x+area.width-width-margin)),y:Math.round(clamp(y,area.y+margin,area.y+area.height-height-margin)),width:Math.ceil(width),height:Math.ceil(height),side};
}
module.exports={PET_SIZES,petWindowSize,clampPet,positionBubble};
