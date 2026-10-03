function myFunction()
{
	$.ajax({
  type: "GET",
  url: "/legislative/schedule/floor_schedule.json",
  crossDomain: false,
  success: function (msg) 
  {
  $.each(msg.floorProceedings, function (key,value)
  {
const d = new Date();
const conveneOffsetMinutes = value.coveneOffsetMinutes;
const conveneYear = value.conveneYear;
const conveneMonth = value.conveneMonth;
const conveneDay = value.conveneDay;
const conveneHour = value.conveneHour;
const conveneMinutes = value.conveneMinutes;
const currentDateTime = new Date(new Date().toLocaleString('en', {timeZone: 'America/New_York'}));
const currentMonth = new Date();
const conveneDateTime = new Date(conveneYear,conveneMonth-1,conveneDay,conveneHour,conveneMinutes-conveneOffsetMinutes);
const button = document.querySelector('.usa-button.radius-pill');
const buttonM = document.querySelector('.usa-button.radius-pill-mobile');
const liveIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
<path fill="white" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
	  

if (currentDateTime >= conveneDateTime) {
  button.classList.add('live-floor-proceedings');
  buttonM.classList.add('live-floor-proceedings');
  button.title = 'Live Floor Proceedings';
  buttonM.title = 'Live Floor Proceedings';
  document.querySelector('.recent-floor-activity-label').textContent = 'Live Floor Proceedings';
  document.getElementById("floorlink").insertAdjacentHTML('beforebegin', liveIcon);
  document.getElementById("floorlink_mobile").insertAdjacentHTML('beforebegin', liveIcon);	
  document.getElementById("floorlink").href = value.convenedSessionLink;
  document.querySelector(".contentdata_mobile").textContent = value.convenedSessionDescription;
  document.getElementById("floorlink_mobile").href = value.convenedSessionLink;
} else {
	button.classList.add('floor-activity-buttons');
  button.title = 'Recent Floor Activity';
  document.querySelector('.recent-floor-activity-label').textContent = 'Recent Floor Activity';
  document.getElementById("floorlink").href = value.outSessionLink;
  document.querySelector(".contentdata_mobile").textContent = value.outSessionDescription;
  document.getElementById("floorlink_mobile").href = value.outSessionLink;
}

    });

  }
});
}