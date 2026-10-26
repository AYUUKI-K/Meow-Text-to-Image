// Keep the host's native toast classes and theme; never patch global toastr.
export function createNotifications(settings,host){
    const send=type=>(...args)=>{if(type==='error'||!settings.hideNonErrorNotifications)return host[type](...args);};
    return {info:send('info'),success:send('success'),warning:send('warning'),error:send('error')};
}
